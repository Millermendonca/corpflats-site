import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense, lazy } from "react";
import { useLocation } from "wouter";
import { useGetSettings } from "@workspace/api-client-react";
import {
  ListOrdered,
  CalendarDays,
  RefreshCw,
  Volume2,
  VolumeX,
  Settings2,
  Download,
  Plus,
} from "lucide-react";
import { Shell } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { playHotelChime } from "@/lib/sound";
import { getCheckinUrl } from "@/lib/checkin-url";
import {
  useQuickMessages,
  WhatsAppQuickMessage,
  cleanWhatsAppPhone,
  buildDirectWaWebUrl,
} from "@/hooks/use-quick-messages";
import { QuickMessageConfirmDialog } from "@/components/quick-message-confirm-dialog";
import { QuarantineDrawer } from "@/components/wbp/QuarantineDrawer";
import { SecureCardModal } from "@/components/wbp/SecureCardModal";
import {
  OtaReservationItem,
  QuarantineResolutionPayload,
  QuarantineRejectPayload,
  WbpIntegrationMode,
} from "@/components/wbp/types";
import {
  UnifiedReservationRow,
  ReservationListFilters,
  DEFAULT_RESERVATION_FILTERS,
  SortField,
  SortDirection,
  TableDensity,
  OptionalColumnKey,
  SavedFilterView,
  FlatSummaryItem,
  QuickTabKey,
  formatCurrencyBRL,
  formatDateBrFull,
} from "@/components/reservations-list/types";
import { ReservationsKpiStrip } from "@/components/reservations-list/ReservationsKpiStrip";
import { ReservationsFilterBar } from "@/components/reservations-list/ReservationsFilterBar";
import { ReservationsDataTable } from "@/components/reservations-list/ReservationsDataTable";
import { ReservationQuickDrawer } from "@/components/reservations-list/ReservationQuickDrawer";
import { ChannexSyncSheet } from "@/components/reservations-list/ChannexSyncSheet";

const PmsCalendarLazy = lazy(() => import("@/pages/pms-calendar"));

const DENSITY_STORAGE_KEY = "corpflats_res_list_density_v1";
const COLUMNS_STORAGE_KEY = "corpflats_res_list_columns_v1";
const SAVED_VIEWS_STORAGE_KEY = "corpflats_res_list_saved_views_v1";
const SOUND_STORAGE_KEY = "corpflats_res_list_sound_v1";

export default function ReservationsListPage() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: settings } = useGetSettings();
  const { activeQuickMessages, dispatchQuickMessage } = useQuickMessages();

  // Detecta se abriu via /quarentena ou ?tab=...
  const initialTabFromUrl = useMemo<QuickTabKey>(() => {
    if (typeof window === "undefined") return "all";
    const sp = new URLSearchParams(window.location.search);
    const qTab = sp.get("tab") as QuickTabKey | null;
    if (qTab) return qTab;
    if (location.startsWith("/quarentena")) return "quarantine";
    return "all";
  }, [location]);

  const [allRows, setAllRows] = useState<UnifiedReservationRow[]>([]);
  const [flats, setFlats] = useState<FlatSummaryItem[]>([]);
  const [todayStr, setTodayStr] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [wbpMode, setWbpMode] = useState<WbpIntegrationMode>("observe");
  const [loading, setLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Filtros & Ordenação (Padrão: Ordem de Chegada no Sistema DESC)
  const [filters, setFilters] = useState<ReservationListFilters>(() => ({
    ...DEFAULT_RESERVATION_FILTERS,
    tab: initialTabFromUrl,
  }));
  const [sortField, setSortField] = useState<SortField>("receivedAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  useEffect(() => {
    if (location.startsWith("/quarentena")) {
      setFilters((prev) => ({ ...prev, tab: "quarantine" }));
    }
  }, [location]);

  // Preferências visuais persistidas
  const [density, setDensity] = useState<TableDensity>(() => {
    try {
      const saved = localStorage.getItem(DENSITY_STORAGE_KEY);
      return saved === "compact" ? "compact" : "comfortable";
    } catch {
      return "comfortable";
    }
  });

  const [visibleColumns, setVisibleColumns] = useState<OptionalColumnKey[]>(() => {
    try {
      const raw = localStorage.getItem(COLUMNS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [customViews, setCustomViews] = useState<SavedFilterView[]>(() => {
    try {
      const raw = localStorage.getItem(SAVED_VIEWS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SOUND_STORAGE_KEY) !== "false";
    } catch {
      return true;
    }
  });

  // Rastreamento de novas reservas que caem ao vivo durante a sessão
  const knownUidsRef = useRef<Set<string>>(new Set());
  const isInitialLoadRef = useRef<boolean>(true);
  const [newArrivalUids, setNewArrivalUids] = useState<Set<string>>(new Set());

  // Seleção em massa
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());

  // Drawers e Modais
  const [drawerUid, setDrawerUid] = useState<string | null>(null);
  const [quarantineItem, setQuarantineItem] = useState<OtaReservationItem | null>(null);
  const [quarantineOpen, setQuarantineOpen] = useState<boolean>(false);
  const [channexSheetOpen, setChannexSheetOpen] = useState<boolean>(false);
  const [secureCardRow, setSecureCardRow] = useState<UnifiedReservationRow | null>(null);
  const [confirmingQuickMsg, setConfirmingQuickMsg] = useState<{
    row: UnifiedReservationRow;
    qm: WhatsAppQuickMessage;
  } | null>(null);

  // Modal Completo do PMS (Edição / Reativação / Nova sem sair da lista)
  const [editingResCode, setEditingResCode] = useState<string | null>(null);
  const [reactivatingResCode, setReactivatingResCode] = useState<string | null>(null);
  const [creatingNewRes, setCreatingNewRes] = useState<boolean>(false);

  const fetchCentralData = useCallback(
    async (showInitialSpinner = false) => {
      if (showInitialSpinner) setLoading(true);
      else setIsSyncing(true);

      try {
        const res = await fetch("/api/pms/reservations/central", {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Falha ao carregar Central de Reservas");
        const data = await res.json();

        const incomingRows: UnifiedReservationRow[] = Array.isArray(data.items)
          ? data.items
          : [];
        if (data.todayStr) setTodayStr(data.todayStr);
        if (Array.isArray(data.flats)) setFlats(data.flats);
        if (data.wbpTelemetry?.mode) setWbpMode(data.wbpTelemetry.mode);
        setNowMs(Date.now());

        if (isInitialLoadRef.current) {
          isInitialLoadRef.current = false;
          incomingRows.forEach((r) => knownUidsRef.current.add(r.uid));
        } else {
          const freshArrivals: UnifiedReservationRow[] = [];
          for (const r of incomingRows) {
            if (!knownUidsRef.current.has(r.uid)) {
              knownUidsRef.current.add(r.uid);
              freshArrivals.push(r);
            }
          }
          if (freshArrivals.length > 0) {
            setNewArrivalUids((prev) => {
              const next = new Set(prev);
              freshArrivals.forEach((f) => next.add(f.uid));
              return next;
            });
            if (soundEnabled) {
              playHotelChime("normal");
            }
            const first = freshArrivals[0];
            toast({
              title:
                freshArrivals.length === 1
                  ? `✨ Nova reserva chegou (${first.channel.toUpperCase()})!`
                  : `✨ ${freshArrivals.length} novas reservas chegaram!`,
              description: `${first.guestName} • ${
                first.flatNumber ? `Flat ${first.flatNumber}` : "Aguardando Flat"
              }`,
            });
          }
        }

        setAllRows(incomingRows);
      } catch (err: any) {
        console.error(err);
      } finally {
        setLoading(false);
        setIsSyncing(false);
      }
    },
    [soundEnabled, toast]
  );

  useEffect(() => {
    fetchCentralData(true);
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      fetchCentralData(false);
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchCentralData]);

  // Atualiza relógio relativo ("há X min") a cada 30s
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // Recarrega quando o botão flutuante global de Nova Reserva fecha após criar algo
  useEffect(() => {
    const onModalState = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (detail && detail.open === false && !isInitialLoadRef.current) {
        fetchCentralData(false);
      }
    };
    window.addEventListener("gfm-res-modal-state", onModalState);
    return () => window.removeEventListener("gfm-res-modal-state", onModalState);
  }, [fetchCentralData]);

  const handleChangeDensity = (d: TableDensity) => {
    setDensity(d);
    try {
      localStorage.setItem(DENSITY_STORAGE_KEY, d);
    } catch {}
  };

  const handleToggleColumn = (col: OptionalColumnKey) => {
    setVisibleColumns((prev) => {
      const next = prev.includes(col)
        ? prev.filter((c) => c !== col)
        : [...prev, col];
      try {
        localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleToggleSound = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SOUND_STORAGE_KEY, String(next));
      } catch {}
      return next;
    });
  };

  const handleSaveCustomView = (name: string) => {
    const newView: SavedFilterView = {
      id: `custom_${Date.now()}`,
      name: `⭐ ${name}`,
      filters: { ...filters },
    };
    setCustomViews((prev) => {
      const next = [...prev, newView];
      try {
        localStorage.setItem(SAVED_VIEWS_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
    toast({ title: "Filtro favorito salvo!", description: name });
  };

  const handleDeleteCustomView = (id: string) => {
    setCustomViews((prev) => {
      const next = prev.filter((v) => v.id !== id);
      try {
        localStorage.setItem(SAVED_VIEWS_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleApplySavedView = (view: SavedFilterView) => {
    setFilters({
      ...DEFAULT_RESERVATION_FILTERS,
      ...view.filters,
    });
  };

  // Contadores das Abas Rápidas (calculados sobre o universo total carregado)
  const tabCounts = useMemo(() => {
    let arrivals_today = 0;
    let in_house = 0;
    let departures_today = 0;
    let pre_reservations = 0;
    let quarantine = 0;
    let cancelled_expired = 0;

    for (const r of allRows) {
      const isCancExp =
        r.canonicalStatus === "cancelada" || r.canonicalStatus === "expirada";
      if (isCancExp) {
        cancelled_expired++;
        continue;
      }
      if (r.canonicalStatus === "quarantine") {
        quarantine++;
      }
      if (r.canonicalStatus === "pre_reserva") {
        pre_reservations++;
      }
      if (r.checkinDate === todayStr && r.canonicalStatus !== "checked_out") {
        arrivals_today++;
      }
      if (r.canonicalStatus === "hospedado") {
        in_house++;
      }
      if (r.checkoutDate === todayStr) {
        departures_today++;
      }
    }

    return {
      all: allRows.length,
      arrivals_today,
      in_house,
      departures_today,
      pre_reservations,
      quarantine,
      cancelled_expired,
    };
  }, [allRows, todayStr]);

  // Filtragem + Ordenação Dinâmica
  const filteredAndSortedRows = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");

    const filtered = allRows.filter((r) => {
      // 1. Tab filter
      if (filters.tab === "arrivals_today") {
        if (
          r.checkinDate !== todayStr ||
          r.canonicalStatus === "cancelada" ||
          r.canonicalStatus === "expirada" ||
          r.canonicalStatus === "checked_out"
        ) {
          return false;
        }
      } else if (filters.tab === "in_house") {
        if (r.canonicalStatus !== "hospedado") return false;
      } else if (filters.tab === "departures_today") {
        if (
          r.checkoutDate !== todayStr ||
          r.canonicalStatus === "cancelada" ||
          r.canonicalStatus === "expirada"
        ) {
          return false;
        }
      } else if (filters.tab === "pre_reservations") {
        if (r.canonicalStatus !== "pre_reserva") return false;
      } else if (filters.tab === "quarantine") {
        if (r.canonicalStatus !== "quarantine") return false;
      } else if (filters.tab === "cancelled_expired") {
        if (
          r.canonicalStatus !== "cancelada" &&
          r.canonicalStatus !== "expirada"
        ) {
          return false;
        }
      }

      // 2. Channel
      if (filters.channel !== "all" && r.channel !== filters.channel) {
        return false;
      }

      // 3. Flat
      if (
        filters.flatNumber !== "all" &&
        String(r.flatNumber || "") !== filters.flatNumber
      ) {
        return false;
      }

      // 4. Financial
      if (filters.financial === "has_balance") {
        if (
          r.balanceDue <= 0.01 ||
          r.canonicalStatus === "cancelada" ||
          r.canonicalStatus === "expirada"
        ) {
          return false;
        }
      } else if (filters.financial === "paid") {
        if (
          r.balanceDue > 0.01 ||
          r.canonicalStatus === "cancelada" ||
          r.canonicalStatus === "expirada"
        ) {
          return false;
        }
      } else if (filters.financial === "cobrar_hotel") {
        if (r.financialBadge !== "cobrar_hotel") return false;
      } else if (filters.financial === "faturado_pj") {
        if (r.financialBadge !== "faturado_pj") return false;
      }

      // 5. Date Range
      if (filters.startDate || filters.endDate) {
        let targetDate = "";
        if (filters.dateTarget === "receivedAt") {
          targetDate = r.receivedAtIso ? r.receivedAtIso.slice(0, 10) : "";
        } else if (filters.dateTarget === "checkinDate") {
          targetDate = r.checkinDate || "";
        } else {
          targetDate = r.checkoutDate || "";
        }
        if (filters.startDate && targetDate < filters.startDate) return false;
        if (filters.endDate && targetDate > filters.endDate) return false;
      }

      // 6. Quick operational chips
      if (filters.onlyWithBreakfast && !r.includeBreakfast) return false;
      if (
        filters.onlyPendingFnrh &&
        (r.fnrhCompleted ||
          r.canonicalStatus === "cancelada" ||
          r.canonicalStatus === "expirada" ||
          r.canonicalStatus === "checked_out")
      ) {
        return false;
      }
      if (
        filters.onlyPendingNfse &&
        (r.invoiceIssued ||
          r.canonicalStatus === "cancelada" ||
          r.canonicalStatus === "expirada")
      ) {
        return false;
      }
      if (filters.onlyCorporate && !r.isCorporateOrB2b) return false;

      // 7. Search
      if (q) {
        const hay = [
          r.guestName,
          r.code,
          r.externalOrderId,
          r.flatNumber ? `flat ${r.flatNumber}` : "",
          r.flatNumber || "",
          r.companyName,
          r.agencyName,
          r.guestEmail,
          r.vehiclePlate,
          r.guestPhone,
          r.guestDocument,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (hay.includes(q)) return true;
        if (qDigits.length >= 3) {
          const phoneDigits = (r.guestPhone || "").replace(/\D/g, "");
          const docDigits = (r.guestDocument || "").replace(/\D/g, "");
          if (phoneDigits.includes(qDigits) || docDigits.includes(qDigits)) {
            return true;
          }
        }
        return false;
      }

      return true;
    });

    const dir = sortDirection === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortField === "receivedAt") {
        if (a.receivedAtMs !== b.receivedAtMs) {
          return (a.receivedAtMs - b.receivedAtMs) * dir;
        }
        return ((a.numericSortTie || 0) - (b.numericSortTie || 0)) * dir;
      }
      if (sortField === "checkinDate") {
        const cmp = (a.checkinDate || "").localeCompare(b.checkinDate || "");
        if (cmp !== 0) return cmp * dir;
        return b.receivedAtMs - a.receivedAtMs;
      }
      if (sortField === "checkoutDate") {
        const cmp = (a.checkoutDate || "").localeCompare(b.checkoutDate || "");
        if (cmp !== 0) return cmp * dir;
        return b.receivedAtMs - a.receivedAtMs;
      }
      if (sortField === "flatNumber") {
        const cmp = String(a.flatNumber || "9999").localeCompare(
          String(b.flatNumber || "9999"),
          undefined,
          { numeric: true }
        );
        return cmp * dir;
      }
      if (sortField === "guestName") {
        return (a.guestName || "").localeCompare(b.guestName || "") * dir;
      }
      if (sortField === "totalAmount") {
        return ((a.totalAmount || 0) - (b.totalAmount || 0)) * dir;
      }
      if (sortField === "netAmount") {
        return ((a.netAmount || 0) - (b.netAmount || 0)) * dir;
      }
      if (sortField === "adr") {
        return ((a.adr || 0) - (b.adr || 0)) * dir;
      }
      if (sortField === "balanceDue") {
        return ((a.balanceDue || 0) - (b.balanceDue || 0)) * dir;
      }
      if (sortField === "status") {
        return (a.canonicalStatus || "").localeCompare(b.canonicalStatus || "") * dir;
      }
      return 0;
    });
  }, [allRows, filters, sortField, sortDirection, todayStr]);

  const handleSortChange = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      setSortDirection(
        field === "checkinDate" || field === "guestName" || field === "flatNumber"
          ? "asc"
          : "desc"
      );
    }
  };

  // Navegação da Gaveta Lateral 360°
  const activeDrawerIndex = useMemo(() => {
    if (!drawerUid) return -1;
    return filteredAndSortedRows.findIndex((r) => r.uid === drawerUid);
  }, [drawerUid, filteredAndSortedRows]);

  const activeDrawerRow =
    activeDrawerIndex >= 0 ? filteredAndSortedRows[activeDrawerIndex] : null;

  const handleSelectRowDrawer = (row: UnifiedReservationRow) => {
    if (row.sourceType === "quarantine" && row.rawQuarantineItem) {
      setQuarantineItem(row.rawQuarantineItem);
      setQuarantineOpen(true);
      return;
    }
    setDrawerUid(row.uid);
  };

  // Ações Rápidas Unitárias
  const copyToClipboard = async (text: string, title: string, desc?: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title, description: desc || text });
    } catch {
      toast({ title: "Copie manualmente:", description: text });
    }
  };

  const getPortalUrl = (row: UnifiedReservationRow) => {
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : "https://corpflats.com.br";
    return `${origin}/minha-reserva/${encodeURIComponent(row.code)}`;
  };

  const handleCopyPortalLink = (row: UnifiedReservationRow) => {
    copyToClipboard(
      getPortalUrl(row),
      "🔗 Link do Portal copiado!",
      `Portal Minha Reserva (${row.code})`
    );
  };

  const handleCopyPreCheckinLink = (row: UnifiedReservationRow) => {
    const url = getCheckinUrl(
      row.rawReservation || { code: row.code, id: row.id },
      1,
      typeof window !== "undefined" ? window.location.origin : "",
      settings as any
    );
    copyToClipboard(
      url,
      "🪪 Link de Pré-Check-in / FNRH copiado!",
      `${row.guestName} (${row.code})`
    );
  };

  const handleCopyBreakfastLink = (row: UnifiedReservationRow) => {
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : "https://corpflats.com.br";
    copyToClipboard(
      `${origin}/cafe/${encodeURIComponent(row.code)}`,
      "☕ Link do Café da Manhã copiado!",
      `${row.guestName} • Flat ${row.flatNumber || "-"}`
    );
  };

  const handleOpenPortalNewTab = (row: UnifiedReservationRow) => {
    window.open(getPortalUrl(row), "_blank", "noopener,noreferrer");
  };

  const handleCopySummaryText = (row: UnifiedReservationRow) => {
    const text = [
      `🏨 *Resumo da Reserva ${row.code}*`,
      `• Hóspede: *${row.guestName}* (${row.guestCount} pax)`,
      `• Acomodação: *Flat ${row.flatNumber || "A definir"}*`,
      `• Check-in: *${formatDateBrFull(row.checkinDate)}* (${row.checkinTime})`,
      `• Check-out: *${formatDateBrFull(row.checkoutDate)}* (${row.checkoutTime})`,
      `• Diárias: *${row.nights} noite(s)*`,
      `• Valor Total: *${formatCurrencyBRL(row.totalAmount)}*`,
      row.balanceDue > 0.01
        ? `• Saldo Pendente: *${formatCurrencyBRL(row.balanceDue)}*`
        : `• Situação: *Quitada*`,
      `• Portal do Hóspede: ${getPortalUrl(row)}`,
    ].join("\n");
    copyToClipboard(text, "📋 Resumo copiado p/ WhatsApp!", row.code);
  };

  const handleLocateInMap = (row: UnifiedReservationRow) => {
    const params = new URLSearchParams();
    if (row.checkinDate) params.set("focusDate", row.checkinDate);
    if (row.flatNumber) params.set("focusFlat", row.flatNumber);
    setLocation(`/reservas?${params.toString()}`);
  };

  const handleOpenInternalChat = (row: UnifiedReservationRow) => {
    const clean = cleanWhatsAppPhone(row.guestPhone || "");
    if (clean) {
      setLocation(`/whatsapp-chat?phone=${encodeURIComponent(clean)}`);
    } else {
      setLocation("/whatsapp-chat");
    }
  };

  const handleOpenExternalWa = (row: UnifiedReservationRow) => {
    const clean = cleanWhatsAppPhone(row.guestPhone || "");
    if (!clean) {
      toast({
        title: "Sem telefone cadastrado",
        description: "Adicione o WhatsApp do hóspede na edição da reserva.",
        variant: "destructive",
      });
      return;
    }
    const url = buildDirectWaWebUrl(clean, `Olá, ${row.guestName}! Tudo bem?`);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleQuickCheckin = async (row: UnifiedReservationRow) => {
    const res = await fetch(
      `/api/pms/reservations/${encodeURIComponent(row.code || String(row.id))}/quick-checkin`,
      { method: "POST", credentials: "include" }
    );
    if (res.ok) {
      toast({
        title: "✓ Check-in confirmado!",
        description: `${row.guestName} está hospedado no Flat ${row.flatNumber || "-"}.`,
      });
      await fetchCentralData(false);
    } else {
      toast({ title: "Erro ao registrar check-in", variant: "destructive" });
    }
  };

  const handleQuickCheckout = async (row: UnifiedReservationRow) => {
    const res = await fetch(
      `/api/pms/reservations/${encodeURIComponent(String(row.id || row.code))}/checkout`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ source: "central_reservations_list" }),
      }
    );
    if (res.ok) {
      toast({
        title: "✓ Check-out realizado!",
        description: `Flat ${row.flatNumber || "-"} liberado para a governança.`,
      });
      await fetchCentralData(false);
    } else {
      toast({ title: "Erro ao registrar check-out", variant: "destructive" });
    }
  };

  const handleUndoCheckout = async (row: UnifiedReservationRow) => {
    const res = await fetch(
      `/api/pms/reservations/${encodeURIComponent(String(row.id || row.code))}/undo-checkout`,
      { method: "POST", credentials: "include" }
    );
    if (res.ok) {
      toast({ title: "Saída desfeita com sucesso!" });
      await fetchCentralData(false);
    } else {
      toast({ title: "Não foi possível desfazer o check-out", variant: "destructive" });
    }
  };

  // Conciliação de Quarentena OTA
  const handleResolveQuarantine = async (
    id: string,
    payload: QuarantineResolutionPayload
  ) => {
    await fetch(`/api/wbp/quarantine/${encodeURIComponent(id)}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    toast({
      title: "Quarentena OTA resolvida!",
      description: payload.flatNumber
        ? `Reserva alocada no Flat ${payload.flatNumber}.`
        : "Reserva conciliada com sucesso.",
    });
    await fetchCentralData(false);
  };

  const handleRejectQuarantine = async (
    id: string,
    payload: QuarantineRejectPayload
  ) => {
    await fetch(`/api/wbp/quarantine/${encodeURIComponent(id)}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    toast({ title: "Item de quarentena rejeitado" });
    await fetchCentralData(false);
  };

  const handleLinkQuarantine = async (id: string, existingReservationId: string) => {
    await fetch(`/api/wbp/quarantine/${encodeURIComponent(id)}/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        pmsReservationId: existingReservationId,
        existingReservationId,
      }),
    });
    toast({
      title: "Reserva OTA vinculada!",
      description: `Associada à reserva ${existingReservationId}.`,
    });
    await fetchCentralData(false);
  };

  // Exportação CSV (das selecionadas ou de todas as filtradas na visão atual)
  const exportRowsToCsv = (targetRows: UnifiedReservationRow[], suffix: string) => {
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const headers = [
      "Chegada no Sistema",
      "Código Reserva",
      "Pedido OTA",
      "Canal",
      "Status",
      "Flat",
      "Hóspede",
      "Telefone",
      "CPF/Doc",
      "Empresa/Agência",
      "Check-in",
      "Check-out",
      "Noites",
      "Valor Bruto (R$)",
      "Valor Pago (R$)",
      "Saldo a Receber (R$)",
      "Líquido Est. (R$)",
      "ADR (R$)",
      "Café Incluso",
      "FNRH Concluída",
      "Placa Veículo",
      "NFS-e Emitida",
      "Criado Por",
    ];

    const lines = [
      headers.map(esc).join(";"),
      ...targetRows.map((r) =>
        [
          r.receivedAtIso ? new Date(r.receivedAtIso).toLocaleString("pt-BR") : "",
          r.code,
          r.externalOrderId || "",
          r.channel,
          r.canonicalStatus,
          r.flatNumber || "",
          r.guestName,
          r.guestPhone,
          r.guestDocument,
          r.companyName || r.agencyName || "",
          formatDateBrFull(r.checkinDate),
          formatDateBrFull(r.checkoutDate),
          r.nights,
          r.totalAmount.toFixed(2).replace(".", ","),
          r.paidAmount.toFixed(2).replace(".", ","),
          r.balanceDue.toFixed(2).replace(".", ","),
          r.netAmount.toFixed(2).replace(".", ","),
          r.adr.toFixed(2).replace(".", ","),
          r.includeBreakfast ? "Sim" : "Não",
          r.fnrhCompleted ? "Sim" : "Não",
          r.vehiclePlate || "",
          r.invoiceIssued ? "Sim" : "Não",
          r.createdByName,
        ]
          .map(esc)
          .join(";")
      ),
    ];

    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `central-reservas-${suffix}-${todayStr}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Planilha CSV gerada!",
      description: `${targetRows.length} reserva(s) exportada(s) com sucesso.`,
    });
  };

  const handleExportSelectedCsv = () => {
    const chosen = filteredAndSortedRows.filter((r) => selectedUids.has(r.uid));
    exportRowsToCsv(chosen.length > 0 ? chosen : filteredAndSortedRows, "selecionadas");
  };

  const handleFullModalClosed = useCallback(() => {
    setEditingResCode(null);
    setReactivatingResCode(null);
    setCreatingNewRes(false);
    fetchCentralData(false);
  }, [fetchCentralData]);

  return (
    <Shell>
      <div className="p-4 sm:p-6 space-y-4 max-w-[100vw] overflow-x-hidden pb-24">
        {/* Cabeçalho Principal + Alternador Mapa/Lista + Ações Globais */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2 flex-wrap">
              <ListOrdered className="w-6 h-6 text-primary shrink-0" />
              <span>Lista de Reservas (Central)</span>
              {tabCounts.quarantine > 0 && (
                <Badge
                  onClick={() => setFilters((p) => ({ ...p, tab: "quarantine" }))}
                  className="bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-black cursor-pointer animate-pulse"
                >
                  {tabCounts.quarantine} em Quarentena OTA
                </Badge>
              )}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5 font-medium">
              Feed ao vivo em ordem de chegada de todos os canais (Site Próprio, WhatsApp, Booking.com, Airbnb e B2B).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Alternador Rápido [📅 Mapa | 📋 Lista] (Padrão Cloudbeds / Stays.net) */}
            <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-800 bg-muted/50 p-0.5 h-8 shadow-2xs">
              <button
                type="button"
                onClick={() => setLocation("/reservas")}
                className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-md text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-background/60 transition-colors cursor-pointer"
                title="Alternar para o Mapa de Ocupação (Calendário PMS)"
              >
                <CalendarDays className="w-3.5 h-3.5" />
                <span>Mapa</span>
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-md text-xs font-bold bg-background text-primary shadow-xs"
                title="Visão atual: Lista Geral de Reservas"
              >
                <ListOrdered className="w-3.5 h-3.5" />
                <span>Lista</span>
              </button>
            </div>

            {/* Botão Feed Ao Vivo + Som */}
            <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-800 bg-background h-8 shadow-2xs overflow-hidden">
              <button
                type="button"
                onClick={() => fetchCentralData(false)}
                className="inline-flex items-center gap-1.5 px-2.5 h-full text-xs font-semibold hover:bg-muted/60 transition-colors cursor-pointer"
                title="Atualizar feed agora (sincronização automática a cada 15s)"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 text-emerald-600 ${
                    isSyncing ? "animate-spin text-primary" : ""
                  }`}
                />
                <span className="hidden sm:inline">
                  {isSyncing ? "Atualizando..." : "Ao vivo"}
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              </button>
              <button
                type="button"
                onClick={handleToggleSound}
                className="px-2 h-full border-l border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
                title={
                  soundEnabled
                    ? "Alerta sonoro ativado ao chegar reserva nova (clique p/ silenciar)"
                    : "Alerta sonoro silenciado (clique p/ ativar)"
                }
              >
                {soundEnabled ? (
                  <Volume2 className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <VolumeX className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            {/* Botão Discreto Sync OTAs / Channex */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setChannexSheetOpen(true)}
              className="h-8 text-xs font-semibold gap-1.5 shadow-2xs"
              title="Controles de sincronização Booking.com / Airbnb (Channex.io)"
            >
              <Settings2 className="w-3.5 h-3.5 text-indigo-600" />
              <span>Sync OTAs</span>
              {tabCounts.quarantine > 0 && (
                <span className="w-2 h-2 rounded-full bg-rose-600 animate-ping" />
              )}
            </Button>

            {/* Exportar CSV do Filtro Atual */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportRowsToCsv(filteredAndSortedRows, "filtro")}
              className="h-8 text-xs font-semibold gap-1.5 shadow-2xs"
              title="Exportar reservas listadas no filtro atual para Excel / CSV"
            >
              <Download className="w-3.5 h-3.5 text-sky-600" />
              <span className="hidden md:inline">Exportar CSV</span>
            </Button>

            {/* + Nova Reserva */}
            <Button
              size="sm"
              onClick={() => {
                setEditingResCode(null);
                setReactivatingResCode(null);
                setCreatingNewRes(true);
              }}
              className="h-8 text-xs font-bold gap-1.5 shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nova Reserva</span>
            </Button>
          </div>
        </div>

        {/* 5 KPIs Dinâmicos do Filtro Atual */}
        <ReservationsKpiStrip
          rows={filteredAndSortedRows}
          todayStr={todayStr}
          activeFinancialFilter={filters.financial}
          onTogglePendingBalanceFilter={() =>
            setFilters((prev) => ({
              ...prev,
              financial: prev.financial === "has_balance" ? "all" : "has_balance",
            }))
          }
        />

        {/* Abas Rápidas + Busca + Filtros Combináveis + Favoritos + Colunas */}
        <ReservationsFilterBar
          filters={filters}
          onChangeFilters={setFilters}
          tabCounts={tabCounts}
          flats={flats}
          density={density}
          onChangeDensity={handleChangeDensity}
          visibleColumns={visibleColumns}
          onToggleColumn={handleToggleColumn}
          customViews={customViews}
          onSaveCustomView={handleSaveCustomView}
          onDeleteCustomView={handleDeleteCustomView}
          onApplySavedView={handleApplySavedView}
        />

        {/* Tabela Principal por Ordem de Chegada */}
        {loading ? (
          <div className="rounded-2xl border bg-card py-20 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-primary" />
            <span>Carregando reservas de todos os canais...</span>
          </div>
        ) : (
          <ReservationsDataTable
            rows={filteredAndSortedRows}
            todayStr={todayStr}
            nowMs={nowMs}
            sortField={sortField}
            sortDirection={sortDirection}
            onSortChange={handleSortChange}
            density={density}
            visibleColumns={visibleColumns}
            newArrivalUids={newArrivalUids}
            selectedUids={selectedUids}
            onToggleSelectRow={(uid) =>
              setSelectedUids((prev) => {
                const next = new Set(prev);
                if (next.has(uid)) next.delete(uid);
                else next.add(uid);
                return next;
              })
            }
            onToggleSelectAllVisible={(uids, select) =>
              setSelectedUids((prev) => {
                const next = new Set(prev);
                uids.forEach((u) => (select ? next.add(u) : next.delete(u)));
                return next;
              })
            }
            onClearSelection={() => setSelectedUids(new Set())}
            onSelectRowDrawer={handleSelectRowDrawer}
            onOpenFullEdit={(row) => {
              setDrawerUid(null);
              setReactivatingResCode(null);
              setCreatingNewRes(false);
              setEditingResCode(row.code || String(row.id));
            }}
            onReactivateExpired={(row) => {
              setDrawerUid(null);
              setEditingResCode(null);
              setCreatingNewRes(false);
              setReactivatingResCode(row.code || String(row.id));
            }}
            onResolveQuarantine={(row) => {
              if (row.rawQuarantineItem) {
                setQuarantineItem(row.rawQuarantineItem);
                setQuarantineOpen(true);
              }
            }}
            onQuickCheckin={handleQuickCheckin}
            onQuickCheckout={handleQuickCheckout}
            onUndoCheckout={handleUndoCheckout}
            onLocateInMap={handleLocateInMap}
            onOpenInternalChat={handleOpenInternalChat}
            onOpenExternalWa={handleOpenExternalWa}
            onTriggerQuickMessage={(row, qm) => setConfirmingQuickMsg({ row, qm })}
            activeQuickMessages={activeQuickMessages}
            onCopyPortalLink={handleCopyPortalLink}
            onCopyPreCheckinLink={handleCopyPreCheckinLink}
            onCopyBreakfastLink={handleCopyBreakfastLink}
            onOpenPortalNewTab={handleOpenPortalNewTab}
            onCopySummaryText={handleCopySummaryText}
            onCopyCode={(text, label) =>
              copyToClipboard(text, `${label || "Código"} copiado!`)
            }
            onOpenNfseHub={(row) =>
              setLocation(`/notas?search=${encodeURIComponent(row.code)}`)
            }
            onOpenPaymentsHub={(row) =>
              setLocation(`/pagamentos?search=${encodeURIComponent(row.code)}`)
            }
            onOpenSecureCard={(row) => setSecureCardRow(row)}
            onExportSelectedCsv={handleExportSelectedCsv}
            onPrintSelected={() => window.print()}
            onBroadcastSelected={() => setLocation("/disparo-inteligente")}
          />
        )}
      </div>

      {/* Gaveta Lateral 360° (Cloudbeds / Mews Style) */}
      <ReservationQuickDrawer
        row={activeDrawerRow}
        open={Boolean(activeDrawerRow)}
        onOpenChange={(open) => {
          if (!open) setDrawerUid(null);
        }}
        todayStr={todayStr}
        hasPrev={activeDrawerIndex > 0}
        hasNext={
          activeDrawerIndex >= 0 &&
          activeDrawerIndex < filteredAndSortedRows.length - 1
        }
        onNavigatePrev={() => {
          if (activeDrawerIndex > 0) {
            setDrawerUid(filteredAndSortedRows[activeDrawerIndex - 1].uid);
          }
        }}
        onNavigateNext={() => {
          if (
            activeDrawerIndex >= 0 &&
            activeDrawerIndex < filteredAndSortedRows.length - 1
          ) {
            setDrawerUid(filteredAndSortedRows[activeDrawerIndex + 1].uid);
          }
        }}
        onOpenFullEdit={(row) => {
          setDrawerUid(null);
          setReactivatingResCode(null);
          setCreatingNewRes(false);
          setEditingResCode(row.code || String(row.id));
        }}
        onReactivateExpired={(row) => {
          setDrawerUid(null);
          setEditingResCode(null);
          setCreatingNewRes(false);
          setReactivatingResCode(row.code || String(row.id));
        }}
        onQuickCheckin={handleQuickCheckin}
        onQuickCheckout={handleQuickCheckout}
        onUndoCheckout={handleUndoCheckout}
        onLocateInMap={handleLocateInMap}
        onOpenInternalChat={handleOpenInternalChat}
        onTriggerQuickMessage={(row, qm) => setConfirmingQuickMsg({ row, qm })}
        activeQuickMessages={activeQuickMessages}
        onCopyPortalLink={handleCopyPortalLink}
        onCopyPreCheckinLink={handleCopyPreCheckinLink}
        onOpenPortalNewTab={handleOpenPortalNewTab}
        onOpenNfseHub={(row) =>
          setLocation(`/notas?search=${encodeURIComponent(row.code)}`)
        }
        onOpenPaymentsHub={(row) =>
          setLocation(`/pagamentos?search=${encodeURIComponent(row.code)}`)
        }
        onOpenSecureCard={(row) => setSecureCardRow(row)}
      />

      {/* Gaveta de Conciliação de Quarentena OTA */}
      <QuarantineDrawer
        item={quarantineItem}
        isOpen={quarantineOpen}
        onClose={() => setQuarantineOpen(false)}
        onResolve={handleResolveQuarantine}
        onReject={handleRejectQuarantine}
        onLink={handleLinkQuarantine}
      />

      {/* Painel Técnico Channex.io / OTAs */}
      <ChannexSyncSheet
        open={channexSheetOpen}
        onOpenChange={setChannexSheetOpen}
        initialMode={wbpMode}
        pendingQuarantineCount={tabCounts.quarantine}
        onRefreshCentral={() => fetchCentralData(false)}
      />

      {/* Cofre Seguro de Cartão Virtual OTA */}
      {secureCardRow && (
        <SecureCardModal
          isOpen={Boolean(secureCardRow)}
          onClose={() => setSecureCardRow(null)}
          reservationId={String(secureCardRow.id)}
          orderId={secureCardRow.externalOrderId || secureCardRow.code}
          guestName={secureCardRow.guestName}
          cardLast4={secureCardRow.cardLast4}
          cardBrand={secureCardRow.cardBrand}
        />
      )}

      {/* Modal de Confirmação de Mensagem Rápida Z-API */}
      {confirmingQuickMsg && (
        <QuickMessageConfirmDialog
          open={Boolean(confirmingQuickMsg)}
          onOpenChange={(open) => {
            if (!open) setConfirmingQuickMsg(null);
          }}
          quickMessage={confirmingQuickMsg.qm}
          resItem={
            confirmingQuickMsg.row.rawReservation || {
              id: confirmingQuickMsg.row.id,
              code: confirmingQuickMsg.row.code,
              flatNumber: confirmingQuickMsg.row.flatNumber,
              guestName: confirmingQuickMsg.row.guestName,
              guestPhone: confirmingQuickMsg.row.guestPhone,
              checkinDate: confirmingQuickMsg.row.checkinDate,
              checkoutDate: confirmingQuickMsg.row.checkoutDate,
              totalAmount: confirmingQuickMsg.row.totalAmount,
              paidAmount: confirmingQuickMsg.row.paidAmount,
              channel: confirmingQuickMsg.row.channel,
            }
          }
          originUrl={typeof window !== "undefined" ? window.location.origin : ""}
          onConfirm={async (qm, options) => {
            await dispatchQuickMessage(
              qm,
              confirmingQuickMsg.row.rawReservation || confirmingQuickMsg.row,
              typeof window !== "undefined" ? window.location.origin : "",
              options
            );
            setConfirmingQuickMsg(null);
          }}
        />
      )}

      {/* Modal Completo do PMS em modo Overlay (sem desmontar nem perder os filtros da lista!) */}
      {(creatingNewRes || editingResCode || reactivatingResCode) && (
        <Suspense fallback={null}>
          <PmsCalendarLazy
            modalOnly
            autoOpenNewRes={creatingNewRes}
            editReservationCode={editingResCode}
            reactivateReservationCode={reactivatingResCode}
            onModalClosed={handleFullModalClosed}
          />
        </Suspense>
      )}
    </Shell>
  );
}
