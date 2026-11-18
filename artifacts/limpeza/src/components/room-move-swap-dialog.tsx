import React, { useState, useEffect, useMemo, useRef } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeftRight,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Lock,
  RefreshCw,
  Scissors,
  Search,
  Sparkles,
  XCircle,
} from "lucide-react";

export interface RoomMoveSwapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  originReservation: any | null;
  flats: any[];
  reservations: any[];
  blocks?: any[];
  cleaningRequests?: any[];
  todayStr: string;
  initialTargetFlatId?: number | string | null;
  initialConflictingReservation?: any | null;
  initialMode?: "split" | "move_whole" | "swap";
  onSuccess?: (result?: any) => void | Promise<void>;
}

interface CleanlinessInfo {
  status: "clean" | "dirty" | "cleaning_now";
  label: string;
  isClean: boolean;
}

function formatDateBr(iso?: string | null): string {
  if (!iso || typeof iso !== "string") return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function formatDateBrShort(iso?: string | null): string {
  if (!iso || typeof iso !== "string") return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}`;
}

function formatBrl(val: number | string | null | undefined): string {
  const num = Number(val) || 0;
  return num.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

function diffDaysIso(startIso?: string, endIso?: string): number {
  if (!startIso || !endIso) return 0;
  const s = new Date(`${startIso.slice(0, 10)}T12:00:00Z`).getTime();
  const e = new Date(`${endIso.slice(0, 10)}T12:00:00Z`).getTime();
  if (isNaN(s) || isNaN(e) || e <= s) return 0;
  return Math.round((e - s) / (24 * 3600 * 1000));
}

function isCancelledOrExpired(res: any): boolean {
  const st = String(res?.status || "").toLowerCase().trim();
  return st === "cancelada" || st === "cancelled" || st === "expirada" || st === "no_show";
}

function resolveFlatCleanliness(
  flat: any,
  cleaningRequests: any[] | undefined,
  todayStr: string
): CleanlinessInfo {
  const fId = flat?.id;
  const fNum = String(flat?.number ?? "");
  if (Array.isArray(cleaningRequests) && cleaningRequests.length > 0) {
    const req = cleaningRequests.find((r: any) => {
      const sameFlat =
        (fId != null && Number(r.flatId) === Number(fId)) ||
        (fNum && String(r.flatNumber) === fNum);
      if (!sameFlat) return false;
      const rDate = String(r.date || r.scheduledDate || todayStr).slice(0, 10);
      if (rDate !== todayStr) return false;
      if (
        r.isInstructionOnly ||
        r.cleaningRequest?.isInstructionOnly ||
        r.source === "manual_instruction" ||
        r.cleaningRequest?.source === "manual_instruction" ||
        r.type === "bed_adjustment_only" ||
        r.type === "instruction"
      ) {
        return false;
      }
      return true;
    });
    if (req) {
      const st = String(req.cleaningRequest?.status || req.status || "").toLowerCase();
      if (st === "cleaning_now" || st === "in_progress") {
        return { status: "cleaning_now", label: "🧼 Limpando", isClean: false };
      }
      if (st === "dirty" || st === "pending") {
        return { status: "dirty", label: "🧹 Sujo", isClean: false };
      }
      if (st === "clean") {
        return { status: "clean", label: "✨ Limpo", isClean: true };
      }
    }
  }

  const st = String(flat?.cleaningStatus || "clean").toLowerCase();
  if (st === "cleaning_now" || st === "in_progress") {
    return { status: "cleaning_now", label: "🧼 Limpando", isClean: false };
  }
  if (st === "dirty" || st === "pending") {
    return { status: "dirty", label: "🧹 Sujo", isClean: false };
  }
  return { status: "clean", label: "✨ Limpo", isClean: true };
}

function renderCleanlinessBadge(info?: CleanlinessInfo | null) {
  if (!info) return null;
  if (info.status === "dirty") {
    return (
      <Badge
        variant="outline"
        className="text-[10px] px-1.5 py-0 h-5 bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800 font-bold"
      >
        🧹 Sujo
      </Badge>
    );
  }
  if (info.status === "cleaning_now") {
    return (
      <Badge
        variant="outline"
        className="text-[10px] px-1.5 py-0 h-5 bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800 font-bold"
      >
        🧼 Limpando
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="text-[10px] px-1.5 py-0 h-5 bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800 font-bold"
    >
      ✨ Limpo
    </Badge>
  );
}

function normalizeTextItem(item: any): string {
  if (!item) return "";
  if (typeof item === "string") return item;
  return (
    item.message ||
    item.description ||
    item.label ||
    item.reason ||
    item.detail ||
    (item.guestName
      ? `${item.guestName}${item.flatNumber ? ` (Flat ${item.flatNumber})` : ""}${
          item.checkinDate && item.checkoutDate
            ? ` • ${formatDateBrShort(item.checkinDate)}–${formatDateBrShort(item.checkoutDate)}`
            : ""
        }`
      : JSON.stringify(item))
  );
}

function buildLocalFallbackMoveSummary(
  res: any,
  targetFlatNumber: string,
  cutDate: string,
  mode: "split" | "move_whole",
  upgradeAdj: number
) {
  const cin = String(res?.checkinDate || "");
  const cout = String(res?.checkoutDate || "");
  const totalBefore = Number(res?.totalAmount) || 0;
  const dailyRates = Array.isArray(res?.dailyRates) ? res.dailyRates : [];
  const chargesList = Array.isArray(res?.charges) ? res.charges : [];
  const explicitFees =
    (Number(res?.cleaningFee) || 0) +
    (Number(res?.petFee) || 0) +
    (Number(res?.extraBedFee) || 0) +
    (Number(res?.twinFee) || 0) +
    (Number(res?.earlyCheckinFee) || 0) +
    (Number(res?.lateCheckoutFee) || 0);
  const chargesTotal =
    chargesList.length > 0
      ? chargesList.reduce((acc: number, c: any) => acc + (Number(c.amount) || 0), 0)
      : explicitFees;

  const canSplit = mode === "split" && Boolean(cin && cout && cutDate > cin && cutDate < cout);
  if (!canSplit) {
    return {
      willSplit: false,
      totalBefore,
      totalAfter: Math.round((totalBefore + upgradeAdj) * 100) / 100,
      part2: {
        flatNumber: targetFlatNumber,
        checkinDate: cin,
        checkoutDate: cout,
        nights: Math.max(1, diffDaysIso(cin, cout)),
        accommodationTotal: Math.max(0, totalBefore - chargesTotal),
        chargesTotal: chargesTotal + upgradeAdj,
        totalAmount: Math.round((totalBefore + upgradeAdj) * 100) / 100,
      },
    };
  }

  const nTotal = Math.max(1, diffDaysIso(cin, cout));
  const n1 = Math.max(1, diffDaysIso(cin, cutDate));
  const n2 = Math.max(1, diffDaysIso(cutDate, cout));

  let acc1 = 0;
  let acc2 = 0;
  if (dailyRates.length > 0) {
    for (const d of dailyRates) {
      const rate = Number(d?.rate ?? d?.amount) || 0;
      if (String(d?.date || "") < cutDate) acc1 += rate;
      else acc2 += rate;
    }
  } else {
    const netAccomm = Math.max(0, totalBefore - chargesTotal);
    const perNight = nTotal > 0 ? netAccomm / nTotal : 0;
    acc1 = Math.round(perNight * n1 * 100) / 100;
    acc2 = Math.round((netAccomm - acc1) * 100) / 100;
  }

  const part1Total = Math.round((acc1 + chargesTotal) * 100) / 100;
  const part2Total = Math.round((acc2 + upgradeAdj) * 100) / 100;

  return {
    willSplit: true,
    totalBefore,
    totalAfter: Math.round((part1Total + part2Total) * 100) / 100,
    part1: {
      flatNumber: String(res?.flatNumber || ""),
      checkinDate: cin,
      checkoutDate: cutDate,
      nights: n1,
      accommodationTotal: Math.round(acc1 * 100) / 100,
      chargesTotal: Math.round(chargesTotal * 100) / 100,
      totalAmount: part1Total,
    },
    part2: {
      flatNumber: targetFlatNumber,
      checkinDate: cutDate,
      checkoutDate: cout,
      nights: n2,
      accommodationTotal: Math.round(acc2 * 100) / 100,
      chargesTotal: Math.round(upgradeAdj * 100) / 100,
      totalAmount: part2Total,
    },
  };
}

export const RoomMoveSwapDialog: React.FC<RoomMoveSwapDialogProps> = ({
  open,
  onOpenChange,
  originReservation,
  flats,
  reservations,
  blocks = [],
  cleaningRequests,
  todayStr,
  initialTargetFlatId = null,
  initialConflictingReservation = null,
  initialMode,
  onSuccess,
}) => {
  const { toast } = useToast();

  const [selectedTargetFlatId, setSelectedTargetFlatId] = useState<string>("");
  const [cutDate, setCutDate] = useState<string>(todayStr);
  const [moveMode, setMoveMode] = useState<"split" | "move_whole">("split");
  const [swapMode, setSwapMode] = useState<"auto" | "move_whole">("auto");
  const [upgradeAdjustmentAmount, setUpgradeAdjustmentAmount] = useState<string>("0");
  const [upgradeAdjustmentNote, setUpgradeAdjustmentNote] = useState<string>("");
  const [upgradeAdjustmentAmountA, setUpgradeAdjustmentAmountA] = useState<string>("0");
  const [upgradeAdjustmentAmountB, setUpgradeAdjustmentAmountB] = useState<string>("0");
  const [generateCutoffCleaning, setGenerateCutoffCleaning] = useState<boolean>(true);
  const [confirmFlatLockOverride, setConfirmFlatLockOverride] = useState<boolean>(false);
  const [flatSearch, setFlatSearch] = useState<string>("");
  const [flatStatusFilter, setFlatStatusFilter] = useState<"all" | "free" | "swap">("all");

  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [previewData, setPreviewData] = useState<any | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const previewAbortRef = useRef<AbortController | null>(null);

  const activeFlats = useMemo(() => {
    return (flats || [])
      .filter((f: any) => f && f.isActive !== false)
      .sort((a: any, b: any) =>
        String(a.number).localeCompare(String(b.number), undefined, { numeric: true })
      );
  }, [flats]);

  // Initialize state whenever dialog opens for a reservation / drag target
  useEffect(() => {
    if (!open || !originReservation) return;

    const stayStartedA =
      Boolean(originReservation.checkinDate && originReservation.checkoutDate) &&
      originReservation.checkinDate < todayStr &&
      originReservation.checkoutDate > todayStr;
    const stayStartedB =
      Boolean(initialConflictingReservation?.checkinDate && initialConflictingReservation?.checkoutDate) &&
      initialConflictingReservation.checkinDate < todayStr &&
      initialConflictingReservation.checkoutDate > todayStr;
    const anyStayStarted = stayStartedA || stayStartedB;

    const defaultCut = anyStayStarted
      ? todayStr
      : originReservation.checkinDate >= todayStr
        ? originReservation.checkinDate
        : todayStr;

    setCutDate(defaultCut);

    if (initialMode === "move_whole") {
      setMoveMode("move_whole");
      setSwapMode("move_whole");
    } else if (initialMode === "split") {
      setMoveMode(stayStartedA ? "split" : "move_whole");
      setSwapMode("auto");
    } else if (initialMode === "swap") {
      setMoveMode(stayStartedA ? "split" : "move_whole");
      setSwapMode("auto");
    } else {
      setMoveMode(stayStartedA ? "split" : "move_whole");
      setSwapMode("auto");
    }

    setSelectedTargetFlatId(
      initialTargetFlatId != null && initialTargetFlatId !== ""
        ? String(initialTargetFlatId)
        : ""
    );
    setUpgradeAdjustmentAmount("0");
    setUpgradeAdjustmentNote("");
    setUpgradeAdjustmentAmountA("0");
    setUpgradeAdjustmentAmountB("0");
    setGenerateCutoffCleaning(anyStayStarted);
    setConfirmFlatLockOverride(false);
    setFlatSearch("");
    setFlatStatusFilter("all");
    setPreviewData(null);
    setPreviewError(null);
    setSubmitError(null);
  }, [open, originReservation?.id, initialTargetFlatId, initialConflictingReservation?.id, initialMode, todayStr]);

  // Compute flat options with occupancy, cleanliness & lock status
  const flatOptions = useMemo(() => {
    if (!originReservation) return [];

    const origFlatIdNum = Number(originReservation.flatId);
    const origFlatNum = String(originReservation.flatNumber || "");
    const resCheckin = String(originReservation.checkinDate || "");
    const resCheckout = String(originReservation.checkoutDate || "");

    return activeFlats.map((flat: any) => {
      const isOriginFlat = Boolean(
        (origFlatIdNum && Number(flat.id) === origFlatIdNum) ||
        (origFlatNum && String(flat.number) === origFlatNum)
      );

      // Determine effective check window based on whether we're evaluating a split/auto cut or whole move
      const isInitialForcedTarget =
        initialTargetFlatId != null &&
        String(flat.id) === String(initialTargetFlatId) &&
        Boolean(initialConflictingReservation);

      const useWholeWindow =
        moveMode === "move_whole" && swapMode === "move_whole";
      const checkStart =
        !useWholeWindow && cutDate && cutDate > resCheckin && cutDate < resCheckout
          ? cutDate
          : resCheckin;

      const overlappingRes = (reservations || []).filter((r: any) => {
        if (!r || Number(r.id) === Number(originReservation.id)) return false;
        if (isCancelledOrExpired(r)) return false;
        const sameFlat =
          Number(r.flatId) === Number(flat.id) ||
          String(r.flatNumber) === String(flat.number);
        if (!sameFlat) return false;
        return r.checkinDate < resCheckout && r.checkoutDate > checkStart;
      });

      const hardBlocks = (blocks || []).filter((b: any) => {
        if (!b) return false;
        const isService = Boolean(b.isServiceBlock || b.reason === "service_order");
        if (isService) return false;
        const sameFlat =
          Number(b.flatId) === Number(flat.id) ||
          String(b.flatNumber) === String(flat.number);
        if (!sameFlat) return false;
        return b.startDate < resCheckout && b.endDate >= checkStart;
      });

      // Fallback: if initialConflictingReservation was explicitly passed for initialTargetFlatId and overlappingRes didn't catch it due to window edge
      const effectiveOverlapping =
        overlappingRes.length === 0 && isInitialForcedTarget && initialConflictingReservation
          ? [initialConflictingReservation]
          : overlappingRes;

      let availability: "origin" | "free" | "swap" | "blocked" = "free";
      if (isOriginFlat) {
        availability = "origin";
      } else if (hardBlocks.length > 0 || effectiveOverlapping.length > 1) {
        availability = "blocked";
      } else if (effectiveOverlapping.length === 1) {
        availability = "swap";
      }

      const occupyingRes = effectiveOverlapping.length === 1 ? effectiveOverlapping[0] : null;
      const cleanliness = resolveFlatCleanliness(flat, cleaningRequests, todayStr);
      const isFlatLocked = Boolean(
        flat.isFlatLocked ||
          flat.flatLocked ||
          occupyingRes?.isFlatLocked ||
          occupyingRes?.flatLocked
      );

      return {
        flat,
        isOriginFlat,
        availability,
        occupyingRes,
        overlappingCount: effectiveOverlapping.length,
        hardBlockCount: hardBlocks.length,
        cleanliness,
        isFlatLocked,
      };
    });
  }, [
    originReservation,
    activeFlats,
    reservations,
    blocks,
    cleaningRequests,
    todayStr,
    cutDate,
    moveMode,
    swapMode,
    initialTargetFlatId,
    initialConflictingReservation,
  ]);

  const selectedFlatOption = useMemo(() => {
    if (!selectedTargetFlatId) return null;
    return (
      flatOptions.find(
        (opt) =>
          String(opt.flat.id) === String(selectedTargetFlatId) ||
          String(opt.flat.number) === String(selectedTargetFlatId)
      ) || null
    );
  }, [flatOptions, selectedTargetFlatId]);

  const activeOccupyingRes = useMemo(() => {
    if (!selectedFlatOption) return null;
    if (selectedFlatOption.availability === "swap" && selectedFlatOption.occupyingRes) {
      return selectedFlatOption.occupyingRes;
    }
    if (
      initialConflictingReservation &&
      initialTargetFlatId != null &&
      String(selectedFlatOption.flat.id) === String(initialTargetFlatId) &&
      selectedFlatOption.overlappingCount <= 1 &&
      selectedFlatOption.hardBlockCount === 0
    ) {
      return initialConflictingReservation;
    }
    return null;
  }, [selectedFlatOption, initialConflictingReservation, initialTargetFlatId]);

  const actionMode: "move" | "swap" = activeOccupyingRes ? "swap" : "move";

  const filteredFlatOptions = useMemo(() => {
    const q = flatSearch.trim().toLowerCase();
    return flatOptions.filter((opt) => {
      if (flatStatusFilter === "free" && opt.availability !== "free") return false;
      if (flatStatusFilter === "swap" && opt.availability !== "swap") return false;
      if (!q) return true;
      const numStr = String(opt.flat.number || "").toLowerCase();
      const nameStr = String(opt.flat.name || "").toLowerCase();
      const occName = String(opt.occupyingRes?.guestName || "").toLowerCase();
      return numStr.includes(q) || nameStr.includes(q) || occName.includes(q);
    });
  }, [flatOptions, flatSearch, flatStatusFilter]);

  // Reset lock confirmation when target flat or mode changes
  useEffect(() => {
    setConfirmFlatLockOverride(false);
    setSubmitError(null);
  }, [selectedTargetFlatId, actionMode, cutDate]);

  // Call backend preview endpoint whenever inputs change
  useEffect(() => {
    if (!open || !originReservation || !selectedFlatOption || selectedFlatOption.isOriginFlat) {
      setPreviewData(null);
      setPreviewError(null);
      return;
    }

    if (previewAbortRef.current) {
      previewAbortRef.current.abort();
    }
    const controller = new AbortController();
    previewAbortRef.current = controller;

    const timer = setTimeout(async () => {
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const body =
          actionMode === "swap" && activeOccupyingRes
            ? {
                action: "swap",
                reservationAId: originReservation.id,
                reservationBId: activeOccupyingRes.id,
                cutDate,
                mode: swapMode,
                upgradeAdjustmentAmountA: Number(upgradeAdjustmentAmountA) || 0,
                upgradeAdjustmentAmountB: Number(upgradeAdjustmentAmountB) || 0,
              }
            : {
                action: "move",
                reservationId: originReservation.id,
                targetFlatId: selectedFlatOption.flat.id,
                cutDate,
                mode: moveMode,
                upgradeAdjustmentAmount: Number(upgradeAdjustmentAmount) || 0,
              };

        const resp = await fetch("/api/pms/reservations/room-move-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          signal: controller.signal,
          body: JSON.stringify(body),
        });
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          setPreviewError(json.error || "Não foi possível gerar a prévia da operação.");
          setPreviewData(json && typeof json === "object" ? json : null);
        } else {
          setPreviewData(json);
        }
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          setPreviewError(err?.message || "Erro ao consultar prévia no servidor.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setPreviewLoading(false);
        }
      }
    }, 140);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    open,
    originReservation?.id,
    selectedFlatOption?.flat?.id,
    selectedFlatOption?.isOriginFlat,
    actionMode,
    activeOccupyingRes?.id,
    cutDate,
    moveMode,
    swapMode,
    upgradeAdjustmentAmount,
    upgradeAdjustmentAmountA,
    upgradeAdjustmentAmountB,
  ]);

  const originStayStarted = Boolean(
    originReservation &&
      originReservation.checkinDate < todayStr &&
      originReservation.checkoutDate > todayStr
  );

  const canSplitOriginOnCutDate = Boolean(
    originReservation &&
      cutDate &&
      cutDate > originReservation.checkinDate &&
      cutDate < originReservation.checkoutDate
  );

  const fallbackMoveSummary = useMemo(() => {
    if (!originReservation || !selectedFlatOption) return null;
    return buildLocalFallbackMoveSummary(
      originReservation,
      String(selectedFlatOption.flat.number),
      cutDate,
      moveMode,
      Number(upgradeAdjustmentAmount) || 0
    );
  }, [originReservation, selectedFlatOption, cutDate, moveMode, upgradeAdjustmentAmount]);

  const effectivePreviewMoveSummary = previewData?.summary || fallbackMoveSummary;

  const hasFlatLockWarning = Boolean(
    previewData?.hasFlatLockWarning ||
      originReservation?.isFlatLocked ||
      originReservation?.flatLocked ||
      selectedFlatOption?.isFlatLocked ||
      activeOccupyingRes?.isFlatLocked ||
      activeOccupyingRes?.flatLocked
  );

  const featureWarnings: any[] = Array.isArray(previewData?.featureWarnings)
    ? previewData.featureWarnings
    : [];

  const conflictsList: any[] = Array.isArray(previewData?.conflicts)
    ? previewData.conflicts
    : [];

  const hasBlockingConflict = Boolean(
    selectedFlatOption?.availability === "blocked" ||
      previewData?.hasConflict ||
      previewData?.canExecute === false
  );

  const canConfirm = Boolean(
    originReservation &&
      selectedFlatOption &&
      !selectedFlatOption.isOriginFlat &&
      cutDate &&
      !submitting &&
      !hasBlockingConflict &&
      (!hasFlatLockWarning || confirmFlatLockOverride)
  );

  const handleSelectFlat = (opt: (typeof flatOptions)[number]) => {
    if (opt.isOriginFlat) return;
    setSelectedTargetFlatId(String(opt.flat.id));
    if (opt.availability === "swap" && opt.occupyingRes) {
      const bStarted =
        opt.occupyingRes.checkinDate < todayStr &&
        opt.occupyingRes.checkoutDate > todayStr;
      if (originStayStarted || bStarted) {
        setGenerateCutoffCleaning(true);
        setCutDate(todayStr);
      }
      setSwapMode("auto");
    } else if (opt.availability === "free") {
      if (originStayStarted) {
        setMoveMode("split");
        setGenerateCutoffCleaning(true);
      } else {
        setMoveMode("move_whole");
      }
    }
  };

  const handleConfirmSubmit = async () => {
    if (!originReservation || !selectedFlatOption || !canConfirm) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const endpoint =
        actionMode === "swap" && activeOccupyingRes
          ? "/api/pms/reservations/swap-flats"
          : `/api/pms/reservations/${encodeURIComponent(String(originReservation.id))}/room-move`;

      const payload =
        actionMode === "swap" && activeOccupyingRes
          ? {
              reservationAId: originReservation.id,
              reservationBId: activeOccupyingRes.id,
              cutDate,
              mode: swapMode,
              generateCutoffCleaning,
              upgradeAdjustmentAmountA: Number(upgradeAdjustmentAmountA) || 0,
              upgradeAdjustmentAmountB: Number(upgradeAdjustmentAmountB) || 0,
              confirmFlatLockOverride,
            }
          : {
              targetFlatId: selectedFlatOption.flat.id,
              cutDate,
              mode: moveMode,
              generateCutoffCleaning,
              upgradeAdjustmentAmount: Number(upgradeAdjustmentAmount) || 0,
              upgradeAdjustmentNote: upgradeAdjustmentNote.trim() || undefined,
              confirmFlatLockOverride,
            };

      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        const msg =
          json.error ||
          json.message ||
          (json.requiresFlatLockConfirmation
            ? "Confirme a liberação do Quarto Preferencial Fixado (🔒) para prosseguir."
            : "Não foi possível concluir a troca de flat.");
        setSubmitError(msg);
        toast({
          title: "Operação bloqueada",
          description: msg,
          variant: "destructive",
        });
        return;
      }

      toast({
        title:
          actionMode === "swap"
            ? `🔁 Inversão concluída: Flat ${originReservation.flatNumber} ⇄ Flat ${selectedFlatOption.flat.number}`
            : `🔀 Troca concluída para o Flat ${selectedFlatOption.flat.number}`,
        description:
          "Estadia atualizada, governança/café sincronizados e nova FNRH disparada no WhatsApp.",
      });

      await onSuccess?.(json);
      onOpenChange(false);
    } catch (err: any) {
      const msg = err?.message || "Erro de rede ao executar troca de flat.";
      setSubmitError(msg);
      toast({
        title: "Erro ao executar troca",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!originReservation) return null;

  const originFlatObj = activeFlats.find(
    (f: any) =>
      Number(f.id) === Number(originReservation.flatId) ||
      String(f.number) === String(originReservation.flatNumber)
  );
  const originCleanliness = originFlatObj
    ? resolveFlatCleanliness(originFlatObj, cleaningRequests, todayStr)
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-[96vw] sm:max-w-3xl max-h-[92dvh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap pr-6 sm:pr-0">
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg font-black text-foreground">
              {actionMode === "swap" ? (
                <ArrowLeftRight className="w-5 h-5 text-indigo-600 shrink-0" />
              ) : (
                <Scissors className="w-5 h-5 text-sky-600 shrink-0" />
              )}
              <span>
                {actionMode === "swap" && selectedFlatOption
                  ? `Inversão Direta de Flats (${originReservation.flatNumber} ⇄ ${selectedFlatOption.flat.number})`
                  : "Troca / Corte de Flat e Inversão Direta"}
              </span>
            </DialogTitle>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge variant="outline" className="font-mono text-[10.5px] font-bold">
                {originReservation.code || `RES-${originReservation.id}`}
              </Badge>
              {(originReservation.isFlatLocked || originReservation.flatLocked) && (
                <Badge className="bg-amber-400 text-slate-950 font-black text-[10px] gap-1">
                  🔒 Fixo
                </Badge>
              )}
            </div>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Transfira um hóspede com corte financeiro automático por data ou faça a inversão atômica entre dois flats ocupados.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1 text-xs">
          {/* Card Resumo da Reserva de Origem */}
          <div className="p-3 rounded-2xl border bg-slate-50/90 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="space-y-0.5 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-black text-sm text-foreground truncate">
                  {originReservation.guestName || "Hóspede"}
                </span>
                <Badge variant="secondary" className="text-[10px] font-black">
                  Flat Atual: {originReservation.flatNumber}
                </Badge>
                {renderCleanlinessBadge(originCleanliness)}
                {originStayStarted && (
                  <Badge className="bg-sky-600 text-white text-[10px] font-bold">
                    Hospedado (Em curso)
                  </Badge>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span>
                  📅 {formatDateBr(originReservation.checkinDate)} →{" "}
                  {formatDateBr(originReservation.checkoutDate)} (
                  {diffDaysIso(originReservation.checkinDate, originReservation.checkoutDate) || 1}{" "}
                  noite(s))
                </span>
                <span>•</span>
                <span>
                  💰 Total:{" "}
                  <strong className="text-foreground">
                    {formatBrl(originReservation.totalAmount)}
                  </strong>
                </span>
              </div>
            </div>

            {selectedFlatOption && !selectedFlatOption.isOriginFlat && (
              <div className="flex items-center gap-1.5 shrink-0 px-2.5 py-1.5 rounded-xl bg-background border border-border font-black">
                <span className="text-rose-600 dark:text-rose-400">
                  Flat {originReservation.flatNumber}
                </span>
                {actionMode === "swap" ? (
                  <ArrowLeftRight className="w-4 h-4 text-indigo-600" />
                ) : (
                  <ArrowRight className="w-4 h-4 text-sky-600" />
                )}
                <span className="text-emerald-700 dark:text-emerald-400">
                  Flat {selectedFlatOption.flat.number}
                </span>
              </div>
            )}
          </div>

          {/* Controle de Data do Corte e Modo de Operação */}
          <div className="p-3.5 rounded-2xl border border-border bg-card space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-4 space-y-1">
                <Label className="text-[11px] font-bold text-foreground">
                  Data da Troca / Corte
                </Label>
                <Input
                  type="date"
                  value={cutDate}
                  onChange={(e) => setCutDate(e.target.value)}
                  className="h-9 text-xs font-bold"
                />
              </div>

              <div className="sm:col-span-8 space-y-1">
                <Label className="text-[11px] font-bold text-foreground">
                  Modo da Alteração
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {actionMode === "swap" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setSwapMode("auto")}
                        className={`h-9 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          swapMode === "auto"
                            ? "bg-indigo-600 text-white border-indigo-700 shadow-xs"
                            : "bg-background text-foreground border-border hover:border-indigo-400"
                        }`}
                      >
                        <span>✂️ Cortar na Data da Troca</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSwapMode("move_whole")}
                        className={`h-9 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          swapMode === "move_whole"
                            ? "bg-sky-600 text-white border-sky-700 shadow-xs"
                            : "bg-background text-foreground border-border hover:border-sky-400"
                        }`}
                      >
                        <span>↔️ Mover Reserva Inteira</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={!canSplitOriginOnCutDate}
                        onClick={() => setMoveMode("split")}
                        className={`h-9 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                          !canSplitOriginOnCutDate
                            ? "opacity-50 cursor-not-allowed bg-muted text-muted-foreground border-border"
                            : moveMode === "split"
                              ? "bg-sky-600 text-white border-sky-700 shadow-xs cursor-pointer"
                              : "bg-background text-foreground border-border hover:border-sky-400 cursor-pointer"
                        }`}
                        title={
                          canSplitOriginOnCutDate
                            ? "Corta a estadia na data escolhida preservando o histórico no flat anterior"
                            : "O corte exige que a data de corte esteja estritamente entre o Check-in e o Check-out"
                        }
                      >
                        <span>✂️ Cortar na Data da Troca</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setMoveMode("move_whole")}
                        className={`h-9 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          moveMode === "move_whole"
                            ? "bg-indigo-600 text-white border-indigo-700 shadow-xs"
                            : "bg-background text-foreground border-border hover:border-indigo-400"
                        }`}
                      >
                        <span>↔️ Mover Reserva Inteira</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {actionMode === "move" && !canSplitOriginOnCutDate && (
              <p className="text-[11px] text-amber-700 dark:text-amber-300 font-medium">
                ℹ️ Para cortar a estadia em 2 partes, informe uma data de corte entre{" "}
                <strong>{formatDateBr(originReservation.checkinDate)}</strong> e{" "}
                <strong>{formatDateBr(originReservation.checkoutDate)}</strong>. Caso contrário, a reserva será movida por inteiro.
              </p>
            )}
          </div>

          {/* Seletor de Flat de Destino com Badges ao Vivo */}
          <div className="p-3.5 rounded-2xl border border-border bg-card space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <Label className="text-xs font-black text-foreground flex items-center gap-1.5">
                <span>1. Selecione o Flat de Destino</span>
                {selectedFlatOption && !selectedFlatOption.isOriginFlat && (
                  <Badge variant="outline" className="text-[10px] font-bold">
                    Selecionado: Flat {selectedFlatOption.flat.number}
                  </Badge>
                )}
              </Label>

              <div className="flex items-center gap-1.5 flex-wrap">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2 top-1/2 -translate-y-1/2" />
                  <Input
                    value={flatSearch}
                    onChange={(e) => setFlatSearch(e.target.value)}
                    placeholder="Buscar flat ou hóspede..."
                    className="h-7 pl-7 pr-2 text-[11px] w-44"
                  />
                </div>
                {(
                  [
                    { id: "all", label: "Todos" },
                    { id: "free", label: "🟢 Livres" },
                    { id: "swap", label: "🔁 Inverter" },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFlatStatusFilter(tab.id)}
                    className={`h-7 px-2 rounded-lg text-[10.5px] font-bold border transition-colors cursor-pointer ${
                      flatStatusFilter === tab.id
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:text-foreground"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-1">
              {filteredFlatOptions.map((opt) => {
                const isSelected =
                  selectedFlatOption &&
                  String(selectedFlatOption.flat.id) === String(opt.flat.id);
                const effectiveCleanliness =
                  isSelected && previewData?.targetCleanliness
                    ? previewData.targetCleanliness
                    : opt.cleanliness;

                return (
                  <button
                    key={opt.flat.id}
                    type="button"
                    disabled={opt.isOriginFlat}
                    onClick={() => handleSelectFlat(opt)}
                    className={`p-2.5 rounded-xl border text-left transition-all flex flex-col gap-1.5 ${
                      opt.isOriginFlat
                        ? "opacity-50 cursor-not-allowed bg-muted/40 border-border"
                        : isSelected
                          ? opt.availability === "swap"
                            ? "border-2 border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/40 shadow-xs cursor-pointer"
                            : opt.availability === "blocked"
                              ? "border-2 border-rose-600 bg-rose-50/60 dark:bg-rose-950/30 cursor-pointer"
                              : "border-2 border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/40 shadow-xs cursor-pointer"
                          : "bg-background hover:bg-muted/40 border-border cursor-pointer"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-black text-xs text-foreground">
                        Flat {opt.flat.number}
                        {opt.isOriginFlat && " (Atual)"}
                      </span>
                      <div className="flex items-center gap-1 flex-wrap justify-end">
                        {opt.isFlatLocked && (
                          <Badge className="bg-amber-400 text-slate-950 text-[9.5px] px-1.5 py-0 h-4 font-black">
                            🔒 Fixo
                          </Badge>
                        )}
                        {renderCleanlinessBadge(effectiveCleanliness)}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 flex-wrap">
                      {opt.isOriginFlat ? (
                        <span className="text-[10.5px] font-semibold text-muted-foreground">
                          Unidade de origem
                        </span>
                      ) : opt.availability === "free" ? (
                        <span className="text-[10.5px] font-bold text-emerald-700 dark:text-emerald-400">
                          🟢 Livre
                        </span>
                      ) : opt.availability === "swap" && opt.occupyingRes ? (
                        <span className="text-[10.5px] font-bold text-indigo-700 dark:text-indigo-300 truncate">
                          🔁 Ocupado por {opt.occupyingRes.guestName} — Inverter
                        </span>
                      ) : (
                        <span className="text-[10.5px] font-bold text-rose-700 dark:text-rose-400">
                          ⛔ Bloqueio / Conflito múltiplo
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Prévia Antes / Depois ou Cards Lado a Lado (Swap) */}
          {selectedFlatOption && !selectedFlatOption.isOriginFlat && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-foreground flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  <span>2. Prévia Financeira & Operacional</span>
                </span>
                {previewLoading && (
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Calculando no servidor...
                  </span>
                )}
              </div>

              {actionMode === "swap" && activeOccupyingRes ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Card Hóspede A */}
                  {(() => {
                    const gA = previewData?.summary?.guestA || {};
                    const willSplitA =
                      gA.willSplit ??
                      (swapMode !== "move_whole" &&
                        originReservation.checkinDate < cutDate &&
                        originReservation.checkoutDate > cutDate);
                    const p1 = gA.part1;
                    const p2 = gA.part2;
                    return (
                      <div className="p-3.5 rounded-2xl border-2 border-indigo-200 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-[10px] font-black uppercase text-indigo-700 dark:text-indigo-300">
                              Hóspede A • {originReservation.code}
                            </div>
                            <div className="font-black text-sm text-foreground truncate">
                              {originReservation.guestName}
                            </div>
                            <div className="text-[11px] font-bold text-indigo-800 dark:text-indigo-200 mt-0.5">
                              Flat {originReservation.flatNumber} → Flat{" "}
                              {selectedFlatOption.flat.number}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <Badge
                              className={
                                willSplitA
                                  ? "bg-sky-600 text-white text-[10px] font-bold"
                                  : "bg-indigo-600 text-white text-[10px] font-bold"
                              }
                            >
                              {willSplitA
                                ? `✂️ Corta em ${formatDateBrShort(cutDate)}`
                                : "↔️ Move inteira"}
                            </Badge>
                            {renderCleanlinessBadge(
                              previewData?.targetCleanliness || selectedFlatOption.cleanliness
                            )}
                          </div>
                        </div>

                        {willSplitA ? (
                          <div className="space-y-1.5 text-[11px]">
                            <div className="p-2 rounded-xl bg-background/80 border border-border">
                              <div className="flex justify-between font-bold">
                                <span>
                                  Parte 1 (Histórico • Flat {originReservation.flatNumber})
                                </span>
                                <span>
                                  {p1?.totalAmount !== undefined
                                    ? formatBrl(p1.totalAmount)
                                    : "—"}
                                </span>
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                {formatDateBrShort(p1?.checkinDate || originReservation.checkinDate)} →{" "}
                                {formatDateBrShort(p1?.checkoutDate || cutDate)} • Diárias &lt; corte + 100% taxas
                              </div>
                            </div>
                            <div className="p-2 rounded-xl bg-background border border-indigo-300 dark:border-indigo-700">
                              <div className="flex justify-between font-bold text-indigo-800 dark:text-indigo-200">
                                <span>
                                  Parte 2 (Ativa • Flat {selectedFlatOption.flat.number})
                                </span>
                                <span>
                                  {p2?.totalAmount !== undefined
                                    ? formatBrl(p2.totalAmount)
                                    : "—"}
                                </span>
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                {formatDateBrShort(p2?.checkinDate || cutDate)} →{" "}
                                {formatDateBrShort(p2?.checkoutDate || originReservation.checkoutDate)} • Diárias &ge; corte + R$ 0 taxas anteriores
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="p-2 rounded-xl bg-background border border-indigo-200 dark:border-indigo-800 text-[11px] space-y-0.5">
                            <div className="flex justify-between font-bold">
                              <span>Período Integral no Flat {selectedFlatOption.flat.number}</span>
                              <span>
                                {formatBrl(
                                  gA.totalAfter ??
                                    (Number(originReservation.totalAmount) || 0) +
                                      (Number(upgradeAdjustmentAmountA) || 0)
                                )}
                              </span>
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {formatDateBr(originReservation.checkinDate)} →{" "}
                              {formatDateBr(originReservation.checkoutDate)}
                            </div>
                          </div>
                        )}

                        <div className="space-y-1">
                          <Label className="text-[10.5px] font-bold">
                            Ajuste / Diferença de Tarifa — Hóspede A (R$)
                          </Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={upgradeAdjustmentAmountA}
                            onChange={(e) => setUpgradeAdjustmentAmountA(e.target.value)}
                            className="h-8 text-xs font-bold bg-background"
                          />
                        </div>
                      </div>
                    );
                  })()}

                  {/* Card Hóspede B */}
                  {(() => {
                    const gB = previewData?.summary?.guestB || {};
                    const willSplitB =
                      gB.willSplit ??
                      (swapMode !== "move_whole" &&
                        activeOccupyingRes.checkinDate < cutDate &&
                        activeOccupyingRes.checkoutDate > cutDate);
                    const p1 = gB.part1;
                    const p2 = gB.part2;
                    return (
                      <div className="p-3.5 rounded-2xl border-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-[10px] font-black uppercase text-emerald-700 dark:text-emerald-300">
                              Hóspede B • {activeOccupyingRes.code || `RES-${activeOccupyingRes.id}`}
                            </div>
                            <div className="font-black text-sm text-foreground truncate">
                              {activeOccupyingRes.guestName}
                            </div>
                            <div className="text-[11px] font-bold text-emerald-800 dark:text-emerald-200 mt-0.5">
                              Flat {selectedFlatOption.flat.number} → Flat{" "}
                              {originReservation.flatNumber}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <Badge
                              className={
                                willSplitB
                                  ? "bg-sky-600 text-white text-[10px] font-bold"
                                  : "bg-emerald-600 text-white text-[10px] font-bold"
                              }
                            >
                              {willSplitB
                                ? `✂️ Corta em ${formatDateBrShort(cutDate)}`
                                : "↔️ Move inteira"}
                            </Badge>
                            {renderCleanlinessBadge(
                              previewData?.targetCleanlinessB || originCleanliness
                            )}
                          </div>
                        </div>

                        {willSplitB ? (
                          <div className="space-y-1.5 text-[11px]">
                            <div className="p-2 rounded-xl bg-background/80 border border-border">
                              <div className="flex justify-between font-bold">
                                <span>
                                  Parte 1 (Histórico • Flat {selectedFlatOption.flat.number})
                                </span>
                                <span>
                                  {p1?.totalAmount !== undefined
                                    ? formatBrl(p1.totalAmount)
                                    : "—"}
                                </span>
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                {formatDateBrShort(p1?.checkinDate || activeOccupyingRes.checkinDate)} →{" "}
                                {formatDateBrShort(p1?.checkoutDate || cutDate)} • Diárias &lt; corte + 100% taxas
                              </div>
                            </div>
                            <div className="p-2 rounded-xl bg-background border border-emerald-300 dark:border-emerald-700">
                              <div className="flex justify-between font-bold text-emerald-800 dark:text-emerald-200">
                                <span>
                                  Parte 2 (Ativa • Flat {originReservation.flatNumber})
                                </span>
                                <span>
                                  {p2?.totalAmount !== undefined
                                    ? formatBrl(p2.totalAmount)
                                    : "—"}
                                </span>
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                {formatDateBrShort(p2?.checkinDate || cutDate)} →{" "}
                                {formatDateBrShort(p2?.checkoutDate || activeOccupyingRes.checkoutDate)} • Diárias &ge; corte + R$ 0 taxas anteriores
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="p-2 rounded-xl bg-background border border-emerald-200 dark:border-emerald-800 text-[11px] space-y-0.5">
                            <div className="flex justify-between font-bold">
                              <span>Período Integral no Flat {originReservation.flatNumber}</span>
                              <span>
                                {formatBrl(
                                  gB.totalAfter ??
                                    (Number(activeOccupyingRes.totalAmount) || 0) +
                                      (Number(upgradeAdjustmentAmountB) || 0)
                                )}
                              </span>
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {formatDateBr(activeOccupyingRes.checkinDate)} →{" "}
                              {formatDateBr(activeOccupyingRes.checkoutDate)}
                            </div>
                          </div>
                        )}

                        <div className="space-y-1">
                          <Label className="text-[10.5px] font-bold">
                            Ajuste / Diferença de Tarifa — Hóspede B (R$)
                          </Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={upgradeAdjustmentAmountB}
                            onChange={(e) => setUpgradeAdjustmentAmountB(e.target.value)}
                            className="h-8 text-xs font-bold bg-background"
                          />
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                /* Prévia Antes / Depois (Movimento para Flat Livre ou Corte) */
                <div className="p-3.5 rounded-2xl border bg-slate-50/70 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 space-y-3">
                  {effectivePreviewMoveSummary?.part1 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="p-3 rounded-xl border bg-background space-y-1">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="text-[10px] font-black">
                            Parte 1 • Histórico (Flat {effectivePreviewMoveSummary.part1.flatNumber || originReservation.flatNumber})
                          </Badge>
                          <span className="font-black text-sm text-foreground">
                            {formatBrl(effectivePreviewMoveSummary.part1.totalAmount)}
                          </span>
                        </div>
                        <p className="text-[11px] font-semibold text-foreground">
                          {formatDateBr(effectivePreviewMoveSummary.part1.checkinDate)} →{" "}
                          {formatDateBr(effectivePreviewMoveSummary.part1.checkoutDate)} (
                          {effectivePreviewMoveSummary.part1.nights ??
                            diffDaysIso(
                              effectivePreviewMoveSummary.part1.checkinDate,
                              effectivePreviewMoveSummary.part1.checkoutDate
                            )}{" "}
                          noite(s))
                        </p>
                        <p className="text-[10.5px] text-muted-foreground">
                          Mantém diárias &lt; {formatDateBrShort(cutDate)} (
                          {formatBrl(
                            effectivePreviewMoveSummary.part1.accommodationTotal ??
                              effectivePreviewMoveSummary.part1.accommodationAmount ??
                              0
                          )}
                          ) + <strong>100% das taxas extras</strong> (
                          {formatBrl(
                            effectivePreviewMoveSummary.part1.chargesTotal ??
                              effectivePreviewMoveSummary.part1.feesTotal ??
                              0
                          )}
                          ).
                        </p>
                      </div>

                      <div className="p-3 rounded-xl border-2 border-sky-300 dark:border-sky-800 bg-sky-50/40 dark:bg-sky-950/20 space-y-1">
                        <div className="flex items-center justify-between">
                          <Badge className="bg-sky-600 text-white text-[10px] font-black">
                            Parte 2 • Ativa (Flat {effectivePreviewMoveSummary.part2?.flatNumber || selectedFlatOption.flat.number})
                          </Badge>
                          <span className="font-black text-sm text-sky-700 dark:text-sky-300">
                            {formatBrl(effectivePreviewMoveSummary.part2?.totalAmount)}
                          </span>
                        </div>
                        <p className="text-[11px] font-semibold text-foreground">
                          {formatDateBr(effectivePreviewMoveSummary.part2?.checkinDate || cutDate)} →{" "}
                          {formatDateBr(
                            effectivePreviewMoveSummary.part2?.checkoutDate ||
                              originReservation.checkoutDate
                          )}{" "}
                          (
                          {effectivePreviewMoveSummary.part2?.nights ??
                            diffDaysIso(
                              effectivePreviewMoveSummary.part2?.checkinDate || cutDate,
                              effectivePreviewMoveSummary.part2?.checkoutDate ||
                                originReservation.checkoutDate
                            )}{" "}
                          noite(s))
                        </p>
                        <p className="text-[10.5px] text-muted-foreground">
                          Diárias &ge; {formatDateBrShort(cutDate)} (
                          {formatBrl(
                            effectivePreviewMoveSummary.part2?.accommodationTotal ??
                              effectivePreviewMoveSummary.part2?.accommodationAmount ??
                              0
                          )}
                          ) + <strong>R$ 0,00 taxas anteriores</strong>
                          {(Number(upgradeAdjustmentAmount) || 0) !== 0
                            ? ` + Ajuste (${formatBrl(Number(upgradeAdjustmentAmount))})`
                            : ""}
                          .
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-2.5 rounded-xl border bg-background">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                          Antes
                        </span>
                        <span className="font-black text-sm">
                          Flat {originReservation.flatNumber} •{" "}
                          {formatBrl(
                            effectivePreviewMoveSummary?.totalBefore ??
                              originReservation.totalAmount
                          )}
                        </span>
                        <span className="text-[11px] text-muted-foreground block">
                          {formatDateBr(originReservation.checkinDate)} →{" "}
                          {formatDateBr(originReservation.checkoutDate)}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-xl border-2 border-emerald-300 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20">
                        <span className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-300 block">
                          Depois (Reserva Inteira)
                        </span>
                        <span className="font-black text-sm text-emerald-800 dark:text-emerald-200">
                          Flat {selectedFlatOption.flat.number} •{" "}
                          {formatBrl(
                            effectivePreviewMoveSummary?.totalAfter ??
                              (Number(originReservation.totalAmount) || 0) +
                                (Number(upgradeAdjustmentAmount) || 0)
                          )}
                        </span>
                        <span className="text-[11px] text-muted-foreground block">
                          {formatDateBr(originReservation.checkinDate)} →{" "}
                          {formatDateBr(originReservation.checkoutDate)}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Resumo Consolidado Antes vs Depois + Campo Ajuste */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end pt-1 border-t border-border/70">
                    <div className="sm:col-span-4">
                      <Label className="text-[10.5px] font-bold">
                        Ajuste / Diferença de Tarifa na 2ª Parte (R$)
                      </Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={upgradeAdjustmentAmount}
                        onChange={(e) => setUpgradeAdjustmentAmount(e.target.value)}
                        className="h-8 text-xs font-bold bg-background mt-0.5"
                      />
                    </div>
                    <div className="sm:col-span-5">
                      <Label className="text-[10.5px] font-bold">
                        Observação do Ajuste (opcional)
                      </Label>
                      <Input
                        type="text"
                        value={upgradeAdjustmentNote}
                        onChange={(e) => setUpgradeAdjustmentNote(e.target.value)}
                        placeholder="Ex: Upgrade para Flat Superior"
                        className="h-8 text-xs bg-background mt-0.5"
                      />
                    </div>
                    <div className="sm:col-span-3 text-right">
                      <span className="text-[10px] text-muted-foreground block">
                        Total Antes → Depois
                      </span>
                      <span className="text-xs font-black text-foreground">
                        {formatBrl(
                          effectivePreviewMoveSummary?.totalBefore ??
                            originReservation.totalAmount
                        )}{" "}
                        →{" "}
                        <span className="text-emerald-700 dark:text-emerald-400">
                          {formatBrl(effectivePreviewMoveSummary?.totalAfter)}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Opções Operacionais e Banners */}
          <div className="space-y-2.5">
            <label className="flex items-start gap-2.5 p-3 rounded-xl border border-border bg-card cursor-pointer hover:bg-muted/30 transition-colors">
              <Checkbox
                checked={generateCutoffCleaning}
                onCheckedChange={(checked) => setGenerateCutoffCleaning(Boolean(checked))}
                className="mt-0.5"
              />
              <div className="space-y-0.5">
                <span className="font-bold text-xs text-foreground block">
                  🧹 Gerar limpeza de saída na data do corte p/ flat(s) desocupado(s)
                </span>
                <span className="text-[10.5px] text-muted-foreground block">
                  Cria automaticamente o card de faxina de saída na governança no dia{" "}
                  {formatDateBr(cutDate)} para o flat anterior e transfere o check-out final para o novo flat.
                </span>
              </div>
            </label>

            <div className="p-3 rounded-xl border border-sky-300/80 dark:border-sky-800 bg-sky-50/70 dark:bg-sky-950/30 text-sky-950 dark:text-sky-100 text-[11px] font-semibold flex items-start gap-2">
              <span className="shrink-0">📲</span>
              <span>
                A FNRH do novo flat será invalidada e enviada automaticamente no WhatsApp do(s) hóspede(s) para nova assinatura.
              </span>
            </div>

            {featureWarnings.length > 0 && (
              <div className="p-3 rounded-xl border border-amber-400/80 bg-amber-50/80 dark:bg-amber-950/35 text-amber-950 dark:text-amber-100 space-y-1">
                <div className="flex items-center gap-1.5 font-black text-xs text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Aviso de Preferências / Características do Flat</span>
                </div>
                <ul className="list-disc pl-5 space-y-0.5 text-[11px]">
                  {featureWarnings.map((w, i) => (
                    <li key={i}>{normalizeTextItem(w)}</li>
                  ))}
                </ul>
              </div>
            )}

            {hasFlatLockWarning && (
              <div className="p-3 rounded-xl border-2 border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-950 dark:text-amber-100 space-y-2">
                <div className="flex items-start gap-2">
                  <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <span className="font-black text-xs block">
                      🔒 Quarto Preferencial Fixado
                    </span>
                    <span className="text-[11px] text-amber-900 dark:text-amber-200 block">
                      {Array.isArray(previewData?.lockedFlats) && previewData.lockedFlats.length > 0
                        ? previewData.lockedFlats.map(normalizeTextItem).join(" • ")
                        : "Há trava de quarto preferencial ativa nesta reserva ou no flat de destino."}
                    </span>
                  </div>
                </div>
                <label className="flex items-center gap-2 pt-1 border-t border-amber-300/70 dark:border-amber-800 cursor-pointer">
                  <Checkbox
                    checked={confirmFlatLockOverride}
                    onCheckedChange={(checked) => setConfirmFlatLockOverride(Boolean(checked))}
                  />
                  <span className="text-[11px] font-bold text-amber-950 dark:text-amber-100">
                    Confirmo a sobreposição da trava de Quarto Preferencial Fixado (🔒)
                  </span>
                </label>
              </div>
            )}

            {(hasBlockingConflict || previewError || submitError) && (
              <div className="p-3 rounded-xl border border-rose-400 bg-rose-50/90 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 space-y-1">
                <div className="flex items-center gap-1.5 font-black text-xs">
                  <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>
                    {submitError ||
                      previewError ||
                      "Conflito / Bloqueio impede a execução nesta configuração"}
                  </span>
                </div>
                {conflictsList.length > 0 && (
                  <ul className="list-disc pl-5 space-y-0.5 text-[11px]">
                    {conflictsList.map((c, idx) => (
                      <li key={idx}>{normalizeTextItem(c)}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="pt-3 border-t border-border flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
            className="text-xs font-semibold"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!canConfirm}
            onClick={handleConfirmSubmit}
            className={`text-xs font-bold gap-1.5 min-w-[170px] ${
              actionMode === "swap"
                ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                : "bg-sky-600 hover:bg-sky-700 text-white"
            }`}
          >
            {submitting ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : actionMode === "swap" ? (
              <ArrowLeftRight className="w-3.5 h-3.5" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5" />
            )}
            <span>
              {submitting
                ? "Processando..."
                : actionMode === "swap"
                  ? "Confirmar Inversão (⇄)"
                  : moveMode === "split"
                    ? "Confirmar Troca com Corte"
                    : "Confirmar Movimentação"}
            </span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
