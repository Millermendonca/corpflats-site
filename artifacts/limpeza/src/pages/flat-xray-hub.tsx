import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Shell } from "@/components/layout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  FLAT_AMENITIES_CATALOG,
  AMENITY_CATEGORIES,
  renderAmenityIcon,
  getFlatActiveAmenities,
} from "@/lib/flat-amenities";
import ServiceOrders from "@/pages/service-orders";
import Tasks from "@/pages/tasks";
import Observations from "@/pages/observations";
import SurveysPage from "@/pages/surveys";
import {
  Activity,
  Wrench,
  Sparkles,
  Plus,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Building2,
  Tag,
  ClipboardCheck,
  FileText,
  Layers,
  Settings,
  RefreshCw,
  ArrowRight,
  PackageOpen,
  RotateCcw,
  Trash2,
  Check,
  Calendar,
  User,
  Wind,
  KeyRound,
  Tv,
  BedDouble,
  Info,
  Filter,
  Eye,
} from "lucide-react";

export interface ServiceCatalogItem {
  id: string;
  name: string;
  category: string;
  icon: string;
  recommendedIntervalDays?: number | null;
  requiresExternalPortal?: boolean;
  tracksRemovedItem?: boolean;
  description?: string;
}

export interface TechnicalSheet {
  acModel?: string;
  acInstallDate?: string;
  curtainMeasure?: string;
  bedDetails?: string;
  lockModel?: string;
  lockBatteryType?: string;
  showerModel?: string;
  tvModel?: string;
  voltage?: string;
  inventoryNotes?: string;
}

export interface ServiceCoverageItem {
  serviceTypeId: string;
  serviceTypeName: string;
  icon: string;
  category: string;
  recommendedIntervalDays: number | null;
  lastDoneAt: string | null;
  lastSummary: string | null;
  lastPerformer: string | null;
  daysSinceLastDone: number | null;
  isOverdue: boolean;
  inProgress: boolean;
  status: "done" | "in_progress" | "overdue" | "never";
}

export interface TimelineEvent {
  id: string;
  type: "diary" | "external_service" | "preventive" | "observation" | "survey";
  serviceTypeId?: string | null;
  title: string;
  description?: string;
  status: string;
  performedBy?: string;
  date: string;
  returnedAt?: string | null;
  itemRemoved?: string | null;
  itemDestination?: string | null;
  photos?: string[];
  rawId?: any;
  surveyAnswers?: Array<{
    questionId: string;
    questionText: string;
    answer: any;
    photoUrl?: string | null;
  }>;
}

export interface FlatXrayItem {
  id: number;
  number: string;
  floor: number;
  isActive: boolean;
  cleaningStatus: "limpo" | "em_limpeza" | "sujo";
  occupancyStatus: "ocupado" | "vago";
  currentGuest: string | null;
  tags: string[];
  airConditionerType: "split" | "janela";
  bedType: "casal" | "solteiro_duplo";
  hasMicrowave: boolean;
  notes: string;
  technicalSheet: TechnicalSheet;
  serviceCoverage: Record<string, ServiceCoverageItem>;
  itemsOutside: any[];
  openIssues: any[];
  preventiveStatuses: any[];
  overduePreventivesCount: number;
  surveyResponses: any[];
  timeline: TimelineEvent[];
}

export interface XrayResponse {
  catalog: ServiceCatalogItem[];
  flats: FlatXrayItem[];
}

function formatShortDate(iso?: string | null): string {
  if (!iso) return "Nunca";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso).slice(0, 10).split("-").reverse().join("/");
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    }).format(d);
  } catch {
    return "-";
  }
}

function formatDateTimePt(iso?: string | null): string {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return "-";
  }
}

export type HubTabId = "xray" | "campaigns" | "preventives" | "issues" | "surveys";

export default function FlatXrayHub({ defaultTab }: { defaultTab?: HubTabId } = {}) {
  const [location] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Determinar aba inicial pela rota ou query string
  const resolvedInitialTab = useMemo<HubTabId>(() => {
    if (defaultTab) return defaultTab;
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab") as HubTabId | null;
      if (tabParam && ["xray", "campaigns", "preventives", "issues", "surveys"].includes(tabParam)) {
        return tabParam;
      }
    }
    if (location.startsWith("/servicos")) return "campaigns";
    if (location.startsWith("/tasks")) return "preventives";
    if (location.startsWith("/observations")) return "issues";
    if (location.startsWith("/surveys")) return "surveys";
    return "xray";
  }, [defaultTab, location]);

  const [activeHubTab, setActiveHubTab] = useState<HubTabId>(resolvedInitialTab);

  useEffect(() => {
    setActiveHubTab(resolvedInitialTab);
  }, [resolvedInitialTab]);

  // Query principal: Raio-X Consolidado dos 19 Flats + Catálogo Oficial
  const {
    data: xrayData,
    isLoading: xrayLoading,
    isFetching: xrayFetching,
    refetch: refetchXray,
  } = useQuery<XrayResponse>({
    queryKey: ["/api/flats/xray"],
    queryFn: async () => {
      const res = await fetch("/api/flats/xray", { credentials: "include" });
      if (!res.ok) throw new Error("Falha ao carregar Raio-X dos Flats");
      return res.json();
    },
    refetchInterval: 20000,
  });

  const catalog = xrayData?.catalog || [];
  const flats = xrayData?.flats || [];

  // Filtros do Raio-X
  const [searchQuery, setSearchQuery] = useState("");
  const [quickFilter, setQuickFilter] = useState<"all" | "attention" | "outside" | "overdue_preventive">("all");
  const [selectedServiceTypeFilter, setSelectedServiceTypeFilter] = useState<string | null>(null);
  const [batchSelectedFlatIds, setBatchSelectedFlatIds] = useState<number[]>([]);

  // Modal de Prontuário 360º de um Flat
  const [selectedFlatId, setSelectedFlatId] = useState<number | null>(null);
  const [prontuarioTab, setProntuarioTab] = useState<"timeline" | "tech_tags" | "preventives_surveys">("timeline");

  const selectedFlat = useMemo(
    () => flats.find((f) => f.id === selectedFlatId) || null,
    [flats, selectedFlatId]
  );

  // Estado da Aba 2 do Prontuário (Ficha Técnica + 76 Tags)
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editAcType, setEditAcType] = useState<"split" | "janela">("split");
  const [editBedType, setEditBedType] = useState<"casal" | "solteiro_duplo">("casal");
  const [editHasMicrowave, setEditHasMicrowave] = useState<boolean>(true);
  const [editNotes, setEditNotes] = useState<string>("");
  const [editTechSheet, setEditTechSheet] = useState<TechnicalSheet>({});
  const [tagCategoryFilter, setTagCategoryFilter] = useState<string>("all");
  const [tagSearch, setTagSearch] = useState<string>("");
  const [customTagInput, setCustomTagInput] = useState<string>("");

  // Carregar dados do flat selecionado para edição
  useEffect(() => {
    if (selectedFlat) {
      setEditTags(Array.isArray(selectedFlat.tags) ? [...selectedFlat.tags] : []);
      setEditAcType(selectedFlat.airConditionerType || "split");
      setEditBedType(selectedFlat.bedType || "casal");
      setEditHasMicrowave(Boolean(selectedFlat.hasMicrowave));
      setEditNotes(selectedFlat.notes || "");
      setEditTechSheet({
        acModel: selectedFlat.technicalSheet?.acModel || "",
        acInstallDate: selectedFlat.technicalSheet?.acInstallDate || "",
        curtainMeasure: selectedFlat.technicalSheet?.curtainMeasure || "",
        bedDetails: selectedFlat.technicalSheet?.bedDetails || "",
        lockModel: selectedFlat.technicalSheet?.lockModel || "",
        lockBatteryType: selectedFlat.technicalSheet?.lockBatteryType || "",
        showerModel: selectedFlat.technicalSheet?.showerModel || "",
        tvModel: selectedFlat.technicalSheet?.tvModel || "",
        voltage: selectedFlat.technicalSheet?.voltage || "220V",
        inventoryNotes: selectedFlat.technicalSheet?.inventoryNotes || "",
      });
    }
  }, [selectedFlat?.id]);

  // Modal: Registrar no Diário / Retirar Item para Lavar ou Conserto
  const [diaryModalOpen, setDiaryModalOpen] = useState(false);
  const [diaryFlatIds, setDiaryFlatIds] = useState<number[]>([]);
  const [diaryServiceTypeId, setDiaryServiceTypeId] = useState<string>("higienizacao_ac");
  const [diaryTitle, setDiaryTitle] = useState("");
  const [diaryDescription, setDiaryDescription] = useState("");
  const [diaryPerformedBy, setDiaryPerformedBy] = useState("");
  const [diaryPerformedAt, setDiaryPerformedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [diaryIsRemovedItem, setDiaryIsRemovedItem] = useState(false);
  const [diaryItemRemoved, setDiaryItemRemoved] = useState("");
  const [diaryItemDestination, setDiaryItemDestination] = useState("");

  const openNewDiaryModal = (opts?: {
    flatIds?: number[];
    serviceTypeId?: string;
    title?: string;
    description?: string;
    isRemovedItem?: boolean;
  }) => {
    const svcId = opts?.serviceTypeId || selectedServiceTypeFilter || "higienizacao_ac";
    const catObj = catalog.find((c) => c.id === svcId);
    setDiaryFlatIds(opts?.flatIds || (selectedFlatId ? [selectedFlatId] : []));
    setDiaryServiceTypeId(svcId);
    setDiaryTitle(opts?.title ?? (catObj ? catObj.name : ""));
    setDiaryDescription(opts?.description || "");
    setDiaryPerformedBy("");
    setDiaryPerformedAt(new Date().toISOString().slice(0, 10));
    const isRemoved = opts?.isRemovedItem ?? Boolean(catObj?.tracksRemovedItem);
    setDiaryIsRemovedItem(isRemoved);
    setDiaryItemRemoved(isRemoved ? "Cortina / Blackout" : "");
    setDiaryItemDestination(isRemoved ? "Lavanderia Externa" : "");
    setDiaryModalOpen(true);
  };

  // Modal: Gerenciar Catálogo Oficial de Serviços
  const [catalogModalOpen, setCatalogModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatIcon, setNewCatIcon] = useState("🔧");
  const [newCatCategory, setNewCatCategory] = useState("geral");
  const [newCatInterval, setNewCatInterval] = useState("90");
  const [newCatTracksRemoved, setNewCatTracksRemoved] = useState(false);

  // Mutation: Criar Registro no Diário (individual ou em lote)
  const createDiaryMutation = useMutation({
    mutationFn: async () => {
      if (diaryFlatIds.length === 0) {
        throw new Error("Selecione pelo menos 1 flat.");
      }
      if (!diaryTitle.trim()) {
        throw new Error("Informe o título ou descrição curta do registro.");
      }
      const res = await fetch("/api/flats/diary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          flatIds: diaryFlatIds,
          serviceTypeId: diaryServiceTypeId || null,
          title: diaryTitle.trim(),
          description: diaryDescription.trim(),
          performedBy: diaryPerformedBy.trim() || undefined,
          performedAt: diaryPerformedAt ? new Date(`${diaryPerformedAt}T12:00:00`).toISOString() : new Date().toISOString(),
          status: diaryIsRemovedItem ? "in_progress_outside" : "done",
          itemRemoved: diaryIsRemovedItem ? diaryItemRemoved.trim() || diaryTitle.trim() : null,
          itemDestination: diaryIsRemovedItem ? diaryItemDestination.trim() || "Lavanderia / Manutenção" : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erro ao registrar no diário.");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/flats/xray"] });
      setDiaryModalOpen(false);
      setBatchSelectedFlatIds([]);
      toast({
        title: diaryIsRemovedItem ? "Retirada de item registrada!" : "Execução registrada no Diário!",
        description: `Histórico atualizado em ${diaryFlatIds.length} flat(s).`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Erro ao salvar registro",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Mutation: Devolver item retirado ao Flat (status -> done)
  const returnItemMutation = useMutation({
    mutationFn: async (entryId: string) => {
      const res = await fetch(`/api/flats/diary/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "done", returnedAt: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error("Falha ao registrar devolução do item.");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/flats/xray"] });
      toast({
        title: "Item devolvido e reinstalado no Flat!",
        description: "O alerta de item fora do flat foi concluído no diário.",
      });
    },
  });

  // Mutation: Excluir registro manual do diário
  const deleteDiaryEntryMutation = useMutation({
    mutationFn: async (entryId: string) => {
      const res = await fetch(`/api/flats/diary/${entryId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Falha ao excluir registro.");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/flats/xray"] });
      toast({ title: "Registro removido do diário." });
    },
  });

  // Mutation: Salvar Ficha Técnica + 76 Tags do Flat
  const saveFlatTechAndTagsMutation = useMutation({
    mutationFn: async (customPayload?: { flatId: number; technicalSheet?: TechnicalSheet; tags?: string[]; notes?: string }) => {
      const targetId = customPayload?.flatId || selectedFlat?.id;
      if (!targetId) throw new Error("Flat não selecionado.");
      const body = customPayload
        ? {
            tags: customPayload.tags,
            notes: customPayload.notes,
            technicalSheet: customPayload.technicalSheet,
          }
        : {
            tags: editTags,
            airConditionerType: editAcType,
            bedType: editBedType,
            hasMicrowave: editHasMicrowave,
            notes: editNotes,
            technicalSheet: editTechSheet,
          };

      const res = await fetch(`/api/flats/${targetId}/tags`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Falha ao atualizar ficha técnica e tags.");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/flats/xray"] });
      queryClient.invalidateQueries({ queryKey: ["/api/flats"] });
      toast({
        title: "Ficha Técnica & Tags Salvas!",
        description: "Os equipamentos, medidas e tags do flat foram sincronizados com todo o sistema e IA Sofia.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Erro ao salvar",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Mutation: Executar Tarefa Preventiva direto pelo Prontuário
  const executePreventiveMutation = useMutation({
    mutationFn: async ({ taskId, flatId }: { taskId: number; flatId: number }) => {
      const res = await fetch(`/api/periodic-tasks/${taskId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ flatId, notes: "Executada via Raio-X do Flat" }),
      });
      if (!res.ok) throw new Error("Falha ao concluir preventiva.");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/flats/xray"] });
      toast({
        title: "Preventiva marcada como concluída!",
        description: "O ciclo de recorrência foi reiniciado para este flat.",
      });
    },
  });

  // Mutation: Criar item no Catálogo Oficial
  const addCatalogMutation = useMutation({
    mutationFn: async () => {
      if (!newCatName.trim()) throw new Error("Informe o nome do serviço.");
      const res = await fetch("/api/service-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: newCatName.trim(),
          icon: newCatIcon || "🔧",
          category: newCatCategory,
          recommendedIntervalDays: newCatInterval ? Number(newCatInterval) : null,
          tracksRemovedItem: newCatTracksRemoved,
          requiresExternalPortal: true,
        }),
      });
      if (!res.ok) throw new Error("Erro ao criar item no catálogo.");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/flats/xray"] });
      queryClient.invalidateQueries({ queryKey: ["/api/service-catalog"] });
      setNewCatName("");
      toast({ title: "Novo tipo de serviço adicionado ao Catálogo Oficial!" });
    },
  });

  const deleteCatalogMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/service-catalog/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Erro ao remover item do catálogo.");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/flats/xray"] });
      queryClient.invalidateQueries({ queryKey: ["/api/service-catalog"] });
      toast({ title: "Tipo de serviço removido do catálogo." });
    },
  });

  // KPIs Consolidados
  const allItemsOutside = useMemo(() => {
    const list: Array<{ flatId: number; flatNumber: string; entry: any }> = [];
    for (const f of flats) {
      for (const item of f.itemsOutside || []) {
        list.push({ flatId: f.id, flatNumber: f.number, entry: item });
      }
    }
    return list;
  }, [flats]);

  const totalOpenIssues = useMemo(
    () => flats.reduce((acc, f) => acc + (f.openIssues?.length || 0), 0),
    [flats]
  );

  const totalOverduePreventives = useMemo(
    () => flats.reduce((acc, f) => acc + (f.overduePreventivesCount || 0), 0),
    [flats]
  );

  // Cobertura por tipo de serviço do catálogo
  const serviceCoverageSummary = useMemo(() => {
    return catalog.map((cat) => {
      let doneCount = 0;
      let inProgressCount = 0;
      let pendingOrOverdueCount = 0;
      const doneFlats: FlatXrayItem[] = [];
      const pendingFlats: FlatXrayItem[] = [];
      const inProgressFlats: FlatXrayItem[] = [];

      for (const f of flats) {
        const cov = f.serviceCoverage?.[cat.id];
        if (cov?.status === "done") {
          doneCount++;
          doneFlats.push(f);
        } else if (cov?.status === "in_progress") {
          inProgressCount++;
          inProgressFlats.push(f);
        } else {
          pendingOrOverdueCount++;
          pendingFlats.push(f);
        }
      }

      const total = flats.length || 19;
      const percent = total > 0 ? Math.round((doneCount / total) * 100) : 0;

      return {
        catalogItem: cat,
        doneCount,
        inProgressCount,
        pendingOrOverdueCount,
        total,
        percent,
        doneFlats,
        pendingFlats,
        inProgressFlats,
      };
    });
  }, [catalog, flats]);

  const activeCoverageDetail = useMemo(
    () => serviceCoverageSummary.find((s) => s.catalogItem.id === selectedServiceTypeFilter) || null,
    [serviceCoverageSummary, selectedServiceTypeFilter]
  );

  // Filtragem de Flats no Grid
  const filteredFlats = useMemo(() => {
    return flats.filter((f) => {
      if (quickFilter === "attention") {
        const hasAttention =
          (f.itemsOutside?.length || 0) > 0 ||
          (f.openIssues?.length || 0) > 0 ||
          (f.overduePreventivesCount || 0) > 0;
        if (!hasAttention) return false;
      } else if (quickFilter === "outside") {
        if ((f.itemsOutside?.length || 0) === 0) return false;
      } else if (quickFilter === "overdue_preventive") {
        if ((f.overduePreventivesCount || 0) === 0) return false;
      }

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const matchNumber = String(f.number).toLowerCase().includes(q);
      const matchTags = (f.tags || []).some((t) => t.toLowerCase().includes(q));
      const matchNotes = (f.notes || "").toLowerCase().includes(q);
      const matchTech = Object.values(f.technicalSheet || {}).some((v) =>
        String(v || "").toLowerCase().includes(q)
      );
      const matchTimeline = (f.timeline || []).some(
        (t) =>
          (t.title || "").toLowerCase().includes(q) ||
          (t.description || "").toLowerCase().includes(q)
      );
      return matchNumber || matchTags || matchNotes || matchTech || matchTimeline;
    });
  }, [flats, quickFilter, searchQuery]);

  // Toggle de tag na Ficha Técnica / 76 Tags
  const handleToggleAmenityTag = (amenityLabel: string, amenityId: string) => {
    setEditTags((prev) => {
      const exists = prev.some(
        (t) => t.toLowerCase() === amenityLabel.toLowerCase() || t.toLowerCase() === amenityId.toLowerCase()
      );
      if (exists) {
        return prev.filter(
          (t) => t.toLowerCase() !== amenityLabel.toLowerCase() && t.toLowerCase() !== amenityId.toLowerCase()
        );
      }
      return [...prev, amenityLabel];
    });
  };

  return (
    <Shell>
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 pb-28 sm:pb-12 space-y-5">
        {/* ════════════════════════════════════════════════════════════════════
            CABEÇALHO UNIFICADO DO HUB DE GOVERNANÇA & RAIO-X DOS FLATS
           ════════════════════════════════════════════════════════════════════ */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-card border rounded-3xl p-4 sm:p-6 shadow-xs">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-primary/15 text-primary flex items-center justify-center shrink-0 shadow-2xs">
              <Activity className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground">
                  Raio-X 360º & Hub dos Flats
                </h1>
                <Badge className="bg-primary/15 text-primary border-primary/30 text-[10px] font-bold">
                  19 Flats Sincronizados
                </Badge>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground leading-snug">
                Diário unificado por flat, matriz de campanhas (AC, dedetização, cortinas), ficha técnica, 76 tags, preventivas e vistorias.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCatalogModalOpen(true)}
              className="h-9 text-xs font-semibold gap-1.5 rounded-xl"
            >
              <Settings className="w-3.5 h-3.5 text-primary" />
              <span>Catálogo de Serviços ({catalog.length})</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                openNewDiaryModal({
                  serviceTypeId: "lavagem_cortina",
                  title: "Retirada de Cortina / Item para Lavar",
                  isRemovedItem: true,
                })
              }
              className="h-9 text-xs font-semibold gap-1.5 rounded-xl border-amber-300 text-amber-800 dark:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20"
            >
              <PackageOpen className="w-3.5 h-3.5" />
              <span>Retirar Item (Ex: Cortina)</span>
            </Button>

            <Button
              size="sm"
              onClick={() => openNewDiaryModal()}
              className="h-9 text-xs font-bold gap-1.5 rounded-xl shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Registrar no Diário</span>
            </Button>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════════
            NAVEGAÇÃO DE ABAS DO HUB UNIFICADO (5 FERRAMENTAS EM 1 SÓ LUGAR)
           ════════════════════════════════════════════════════════════════════ */}
        <Tabs
          value={activeHubTab}
          onValueChange={(v) => setActiveHubTab(v as HubTabId)}
          className="space-y-5"
        >
          <TabsList className="flex flex-wrap sm:grid sm:grid-cols-5 w-full h-auto p-1.5 bg-muted/80 rounded-2xl gap-1">
            <TabsTrigger
              value="xray"
              className="flex-1 py-2 px-3 rounded-xl text-xs font-bold gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-xs"
            >
              <Activity className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="truncate">🏥 Raio-X & Diário</span>
            </TabsTrigger>

            <TabsTrigger
              value="campaigns"
              className="flex-1 py-2 px-3 rounded-xl text-xs font-bold gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-xs"
            >
              <Wrench className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="truncate">🚀 Campanhas Externas</span>
            </TabsTrigger>

            <TabsTrigger
              value="preventives"
              className="flex-1 py-2 px-3 rounded-xl text-xs font-bold gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-xs"
            >
              <Clock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="truncate">🔄 Preventivas</span>
              {totalOverduePreventives > 0 && (
                <Badge className="bg-rose-500 text-white text-[9px] px-1.5 py-0 ml-0.5">
                  {totalOverduePreventives}
                </Badge>
              )}
            </TabsTrigger>

            <TabsTrigger
              value="issues"
              className="flex-1 py-2 px-3 rounded-xl text-xs font-bold gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-xs"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
              <span className="truncate">⚠️ Ocorrências</span>
              {totalOpenIssues > 0 && (
                <Badge className="bg-amber-500 text-white text-[9px] px-1.5 py-0 ml-0.5">
                  {totalOpenIssues}
                </Badge>
              )}
            </TabsTrigger>

            <TabsTrigger
              value="surveys"
              className="flex-1 py-2 px-3 rounded-xl text-xs font-bold gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-xs"
            >
              <ClipboardCheck className="w-3.5 h-3.5 text-sky-600 shrink-0" />
              <span className="truncate">📋 Vistorias</span>
            </TabsTrigger>
          </TabsList>

          {/* ══════════════════════════════════════════════════════════════════
              ABA 1: RAIO-X 360º & DIÁRIO DOS FLATS
             ══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="xray" className="space-y-5 focus-visible:outline-none">
            {/* Banner de Alerta: Itens Retirados / Fora do Flat (Ex: Cortina na Lavanderia) */}
            {allItemsOutside.length > 0 && (
              <div className="p-4 rounded-2xl border-2 border-amber-400/70 bg-amber-500/10 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <PackageOpen className="w-5 h-5 text-amber-600 shrink-0" />
                    <span className="text-sm font-black text-amber-950 dark:text-amber-200">
                      Itens Retirados / Fora do Flat no Momento ({allItemsOutside.length})
                    </span>
                  </div>
                  <span className="text-xs text-amber-800 dark:text-amber-300">
                    Clique em "Devolver ao Flat" assim que o item for reinstalado no apartamento.
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {allItemsOutside.map(({ flatId, flatNumber, entry }) => (
                    <div
                      key={entry.id}
                      className="p-3 rounded-xl bg-background border border-amber-300/80 flex items-center justify-between gap-3 shadow-2xs"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <Badge className="bg-amber-600 text-white text-[10px] font-bold">
                            Flat {flatNumber}
                          </Badge>
                          <span className="text-xs font-bold text-foreground truncate">
                            {entry.itemRemoved || entry.title}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate">
                          📍 {entry.itemDestination || "Em manutenção/lavanderia"} • desde{" "}
                          {formatShortDate(entry.performedAt)}
                        </p>
                      </div>

                      <Button
                        size="sm"
                        onClick={() => returnItemMutation.mutate(entry.id)}
                        disabled={returnItemMutation.isPending}
                        className="h-8 px-2.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 gap-1 rounded-lg"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Devolver</span>
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── MATRIZ DE COBERTURA POR TIPO DE SERVIÇO ("QUEM JÁ FEZ VS. QUEM FALTA") ── */}
            <Card className="rounded-3xl border shadow-xs overflow-hidden">
              <CardHeader className="p-4 sm:p-5 pb-3 border-b bg-muted/20">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base font-black flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-primary" />
                      <span>Matriz de Cobertura de Serviços nos 19 Flats (Quem já fez vs. Quem falta)</span>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Clique em qualquer serviço abaixo para ver exatamente quais flats já foram feitos, quando foram feitos e dar baixa rápida nos pendentes.
                    </CardDescription>
                  </div>
                  {selectedServiceTypeFilter && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedServiceTypeFilter(null);
                        setBatchSelectedFlatIds([]);
                      }}
                      className="h-7 text-xs text-muted-foreground"
                    >
                      Fechar matriz detalhada ×
                    </Button>
                  )}
                </div>
              </CardHeader>

              <CardContent className="p-4 sm:p-5 space-y-4">
                {/* Pílulas dos Tipos de Serviço */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                  {serviceCoverageSummary.map((item) => {
                    const isSelected = selectedServiceTypeFilter === item.catalogItem.id;
                    return (
                      <div
                        key={item.catalogItem.id}
                        onClick={() => {
                          setSelectedServiceTypeFilter(isSelected ? null : item.catalogItem.id);
                          setBatchSelectedFlatIds([]);
                        }}
                        className={`cursor-pointer p-3 rounded-2xl border transition-all space-y-2 ${
                          isSelected
                            ? "border-primary bg-primary/10 shadow-xs ring-2 ring-primary/20"
                            : "border-border hover:border-primary/40 bg-card"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-lg shrink-0">{item.catalogItem.icon || "🔧"}</span>
                            <span className="text-xs font-bold text-foreground line-clamp-1">
                              {item.catalogItem.name}
                            </span>
                          </div>
                          <Badge
                            variant="outline"
                            className={`text-[10px] font-bold shrink-0 ${
                              item.doneCount === item.total
                                ? "bg-emerald-500/15 text-emerald-700 border-emerald-300"
                                : "bg-muted"
                            }`}
                          >
                            {item.doneCount}/{item.total}
                          </Badge>
                        </div>

                        <Progress value={item.percent} className="h-1.5" />

                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                            ✓ {item.doneCount} em dia
                          </span>
                          {item.inProgressCount > 0 && (
                            <span className="text-amber-600 font-semibold">
                              ⏳ {item.inProgressCount} andamento
                            </span>
                          )}
                          <span>Faltam {item.pendingOrOverdueCount}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Painel Expandido da Matriz quando um Serviço está Selecionado */}
                {activeCoverageDetail && (
                  <div className="p-4 rounded-2xl border-2 border-primary/30 bg-primary/5 space-y-4 animate-in fade-in">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-primary/20 pb-3">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{activeCoverageDetail.catalogItem.icon}</span>
                          <h3 className="text-base font-black text-foreground">
                            Raio-X de Cobertura: {activeCoverageDetail.catalogItem.name}
                          </h3>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {activeCoverageDetail.catalogItem.recommendedIntervalDays
                            ? `Ciclo recomendado: a cada ${activeCoverageDetail.catalogItem.recommendedIntervalDays} dias.`
                            : "Serviço sob demanda."}{" "}
                          Clique nos flats pendentes abaixo para registrar execução em lote ou individual.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {activeCoverageDetail.pendingFlats.length > 0 && (
                          <Button
                            size="sm"
                            onClick={() =>
                              openNewDiaryModal({
                                flatIds:
                                  batchSelectedFlatIds.length > 0
                                    ? batchSelectedFlatIds
                                    : activeCoverageDetail.pendingFlats.map((f) => f.id),
                                serviceTypeId: activeCoverageDetail.catalogItem.id,
                                title: activeCoverageDetail.catalogItem.name,
                                isRemovedItem: Boolean(activeCoverageDetail.catalogItem.tracksRemovedItem),
                              })
                            }
                            className="h-8 text-xs font-bold gap-1.5 rounded-xl"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>
                              {batchSelectedFlatIds.length > 0
                                ? `Registrar nos ${batchSelectedFlatIds.length} Selecionados`
                                : `Registrar Execução nos Pendentes (${activeCoverageDetail.pendingFlats.length})`}
                            </span>
                          </Button>
                        )}

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setActiveHubTab("campaigns")}
                          className="h-8 text-xs font-semibold gap-1 rounded-xl"
                        >
                          <Wrench className="w-3.5 h-3.5" />
                          <span>Ver Ordem de Terceirizado</span>
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Coluna 1: Flats Concluídos / Em Dia */}
                      <div className="p-3.5 rounded-xl bg-background border space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4" />
                            JÁ FEITOS / EM DIA ({activeCoverageDetail.doneFlats.length})
                          </span>
                        </div>
                        {activeCoverageDetail.doneFlats.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-4 text-center">
                            Nenhum flat concluído recentemente para este serviço.
                          </p>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {activeCoverageDetail.doneFlats.map((f) => {
                              const cov = f.serviceCoverage[activeCoverageDetail.catalogItem.id];
                              return (
                                <div
                                  key={f.id}
                                  onClick={() => {
                                    setSelectedFlatId(f.id);
                                    setProntuarioTab("timeline");
                                  }}
                                  className="cursor-pointer p-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 transition-all"
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-black text-xs text-foreground">Flat {f.number}</span>
                                    <span className="text-[10px] text-emerald-700 dark:text-emerald-300 font-bold">
                                      ✓ {formatShortDate(cov?.lastDoneAt)}
                                    </span>
                                  </div>
                                  {cov?.lastPerformer && (
                                    <span className="text-[10px] text-muted-foreground truncate block mt-0.5">
                                      👤 {cov.lastPerformer}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Coluna 2: Flats Pendentes / Faltam Fazer */}
                      <div className="p-3.5 rounded-xl bg-background border space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                            <Clock className="w-4 h-4" />
                            FALTAM FAZER / PENDENTES ({activeCoverageDetail.pendingFlats.length + activeCoverageDetail.inProgressFlats.length})
                          </span>
                          {activeCoverageDetail.pendingFlats.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const allPendingIds = activeCoverageDetail.pendingFlats.map((f) => f.id);
                                setBatchSelectedFlatIds(
                                  batchSelectedFlatIds.length === allPendingIds.length ? [] : allPendingIds
                                );
                              }}
                              className="text-[11px] font-bold text-primary hover:underline"
                            >
                              {batchSelectedFlatIds.length === activeCoverageDetail.pendingFlats.length
                                ? "Desmarcar todos"
                                : "Selecionar todos"}
                            </button>
                          )}
                        </div>

                        {activeCoverageDetail.pendingFlats.length === 0 &&
                        activeCoverageDetail.inProgressFlats.length === 0 ? (
                          <p className="text-xs text-emerald-600 font-bold py-4 text-center">
                            🎉 Todos os 19 flats estão 100% em dia neste serviço!
                          </p>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {[...activeCoverageDetail.inProgressFlats, ...activeCoverageDetail.pendingFlats].map((f) => {
                              const cov = f.serviceCoverage[activeCoverageDetail.catalogItem.id];
                              const isSelected = batchSelectedFlatIds.includes(f.id);
                              return (
                                <div
                                  key={f.id}
                                  onClick={() => {
                                    setBatchSelectedFlatIds((prev) =>
                                      prev.includes(f.id) ? prev.filter((id) => id !== f.id) : [...prev, f.id]
                                    );
                                  }}
                                  className={`cursor-pointer p-2 rounded-xl border transition-all flex items-center justify-between gap-1.5 ${
                                    isSelected
                                      ? "border-primary bg-primary/15 font-bold"
                                      : cov?.status === "in_progress"
                                      ? "border-sky-400 bg-sky-500/10"
                                      : "border-border hover:bg-muted/50"
                                  }`}
                                >
                                  <div className="min-w-0">
                                    <span className="font-black text-xs text-foreground block">
                                      Flat {f.number}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground block truncate">
                                      {cov?.status === "in_progress"
                                        ? "⏳ Em andamento"
                                        : cov?.lastDoneAt
                                        ? `Últ: ${formatShortDate(cov.lastDoneAt)}`
                                        : "Nunca registrado"}
                                    </span>
                                  </div>
                                  <Checkbox checked={isSelected} />
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── BARRA DE BUSCA E FILTROS DOS 19 FLATS ── */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card p-3.5 rounded-2xl border shadow-xs">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar flat por número (ex: 205), equipamento (ex: Split, LG, 12000 BTUs), tag ou nota..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 text-xs sm:text-sm rounded-xl"
                />
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <Button
                  variant={quickFilter === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setQuickFilter("all")}
                  className="h-8 text-xs font-bold rounded-xl"
                >
                  Todos ({flats.length})
                </Button>
                <Button
                  variant={quickFilter === "attention" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setQuickFilter("attention")}
                  className="h-8 text-xs font-bold rounded-xl gap-1"
                >
                  <span>⚠️ Com Alertas</span>
                </Button>
                <Button
                  variant={quickFilter === "outside" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setQuickFilter("outside")}
                  className="h-8 text-xs font-bold rounded-xl gap-1"
                >
                  <span>🪟 Item Fora ({allItemsOutside.length})</span>
                </Button>
                <Button
                  variant={quickFilter === "overdue_preventive" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setQuickFilter("overdue_preventive")}
                  className="h-8 text-xs font-bold rounded-xl gap-1"
                >
                  <span>🔄 Preventiva Vencida</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => refetchXray()}
                  disabled={xrayFetching}
                  className="h-8 px-2.5"
                  title="Atualizar Raio-X"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${xrayFetching ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </div>

            {/* ── GRID DE CARDS DE RAIO-X 360º DOS 19 FLATS ── */}
            {xrayLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Card key={i} className="h-64 animate-pulse bg-muted/40 rounded-3xl" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredFlats.map((flat) => {
                  const activeAmenities = getFlatActiveAmenities(flat);
                  const acCov = flat.serviceCoverage?.["higienizacao_ac"];
                  const dedetCov = flat.serviceCoverage?.["dedetizacao"];
                  const cortinaCov = flat.serviceCoverage?.["lavagem_cortina"];
                  const hasAlerts =
                    (flat.itemsOutside?.length || 0) > 0 ||
                    (flat.openIssues?.length || 0) > 0 ||
                    (flat.overduePreventivesCount || 0) > 0;

                  return (
                    <Card
                      key={flat.id}
                      onClick={() => {
                        setSelectedFlatId(flat.id);
                        setProntuarioTab("timeline");
                      }}
                      className={`cursor-pointer rounded-3xl border transition-all hover:shadow-md flex flex-col justify-between overflow-hidden ${
                        hasAlerts
                          ? "border-amber-400/70 bg-card"
                          : "border-border hover:border-primary/40 bg-card"
                      }`}
                    >
                      <CardHeader className="p-4 pb-2.5 space-y-2.5">
                        {/* Topo: Número do Flat + Status Operacional em Tempo Real */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary font-black text-base flex items-center justify-center">
                              {flat.number}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-black text-base text-foreground">
                                  Flat {flat.number}
                                </span>
                                <span className="text-[11px] text-muted-foreground">
                                  • {flat.floor}º Andar
                                </span>
                              </div>
                              <div className="flex items-center gap-1 mt-0.5">
                                {flat.occupancyStatus === "ocupado" ? (
                                  <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-300 text-[10px] px-1.5 py-0 font-bold">
                                    🔴 Ocupado {flat.currentGuest ? `(${flat.currentGuest.split(" ")[0]})` : ""}
                                  </Badge>
                                ) : flat.cleaningStatus === "sujo" ? (
                                  <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-300 text-[10px] px-1.5 py-0 font-bold">
                                    🧹 Vago Sujo
                                  </Badge>
                                ) : (
                                  <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-300 text-[10px] px-1.5 py-0 font-bold">
                                    🟢 Vago Limpo
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              openNewDiaryModal({ flatIds: [flat.id] });
                            }}
                            className="h-8 px-2.5 text-xs font-bold text-primary hover:bg-primary/10 rounded-xl gap-1"
                            title="Adicionar registro rápido no diário deste flat"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Diário</span>
                          </Button>
                        </div>

                        {/* Alertas Ativos do Flat (Item fora, Avaria aberta, Preventiva vencida) */}
                        {hasAlerts && (
                          <div className="flex flex-wrap gap-1.5 pt-0.5">
                            {(flat.itemsOutside || []).map((item: any) => (
                              <Badge
                                key={item.id}
                                className="bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-lg"
                              >
                                🪟 Fora: {item.itemRemoved || item.title}
                              </Badge>
                            ))}
                            {(flat.openIssues?.length || 0) > 0 && (
                              <Badge className="bg-rose-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-lg">
                                ⚠️ {flat.openIssues.length} avaria(s) aberta(s)
                              </Badge>
                            )}
                            {flat.overduePreventivesCount > 0 && (
                              <Badge className="bg-purple-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-lg">
                                🔄 {flat.overduePreventivesCount} preventiva(s) vencida(s)
                              </Badge>
                            )}
                          </div>
                        )}
                      </CardHeader>

                      <CardContent className="px-4 py-2.5 space-y-3 flex-1">
                        {/* Resumo dos Principais Serviços (AC, Dedetização, Cortina) */}
                        <div className="grid grid-cols-3 gap-1.5 p-2 rounded-2xl bg-muted/40 border text-[10px]">
                          <div className="space-y-0.5">
                            <span className="text-muted-foreground font-semibold block truncate">❄️ Higien. AC</span>
                            <span
                              className={`font-bold block ${
                                acCov?.status === "done"
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : acCov?.status === "in_progress"
                                  ? "text-sky-600"
                                  : "text-amber-600"
                              }`}
                            >
                              {acCov?.lastDoneAt
                                ? formatShortDate(acCov.lastDoneAt)
                                : acCov?.status === "in_progress"
                                ? "Andamento"
                                : "Pendente"}
                            </span>
                          </div>

                          <div className="space-y-0.5 border-l pl-2">
                            <span className="text-muted-foreground font-semibold block truncate">🪲 Dedetização</span>
                            <span
                              className={`font-bold block ${
                                dedetCov?.status === "done"
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : dedetCov?.status === "in_progress"
                                  ? "text-sky-600"
                                  : "text-amber-600"
                              }`}
                            >
                              {dedetCov?.lastDoneAt
                                ? formatShortDate(dedetCov.lastDoneAt)
                                : dedetCov?.status === "in_progress"
                                ? "Andamento"
                                : "Pendente"}
                            </span>
                          </div>

                          <div className="space-y-0.5 border-l pl-2">
                            <span className="text-muted-foreground font-semibold block truncate">🪟 Cortina</span>
                            <span
                              className={`font-bold block ${
                                (flat.itemsOutside?.length || 0) > 0
                                  ? "text-amber-600"
                                  : cortinaCov?.lastDoneAt
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {(flat.itemsOutside?.length || 0) > 0
                                ? "Lavando"
                                : cortinaCov?.lastDoneAt
                                ? formatShortDate(cortinaCov.lastDoneAt)
                                : "-"}
                            </span>
                          </div>
                        </div>

                        {/* Equipamentos & Tags Principais ("O que tem no flat") */}
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap gap-1">
                            {activeAmenities.slice(0, 5).map((am) => (
                              <Badge
                                key={am.id}
                                variant="outline"
                                className="text-[10px] py-0 px-1.5 bg-background font-medium flex items-center gap-1"
                              >
                                {renderAmenityIcon(am.iconName, `w-3 h-3 ${am.colorClass || "text-primary"}`)}
                                <span className="truncate max-w-[95px]">{am.label}</span>
                              </Badge>
                            ))}
                            {activeAmenities.length > 5 && (
                              <Badge variant="secondary" className="text-[10px] py-0 px-1.5 font-bold">
                                +{activeAmenities.length - 5} tags
                              </Badge>
                            )}
                          </div>

                          {/* Resumo da Ficha Técnica se preenchida */}
                          {(flat.technicalSheet?.acModel ||
                            flat.technicalSheet?.curtainMeasure ||
                            flat.technicalSheet?.lockModel) && (
                            <p className="text-[11px] text-muted-foreground truncate">
                              {[
                                flat.technicalSheet.acModel ? `AC: ${flat.technicalSheet.acModel}` : null,
                                flat.technicalSheet.curtainMeasure ? `Cortina: ${flat.technicalSheet.curtainMeasure}` : null,
                                flat.technicalSheet.lockModel ? `Fechadura: ${flat.technicalSheet.lockModel}` : null,
                              ]
                                .filter(Boolean)
                                .join(" • ")}
                            </p>
                          )}
                        </div>

                        {/* Último evento da linha do tempo */}
                        {flat.timeline && flat.timeline.length > 0 && (
                          <div className="pt-1 border-t text-[11px] text-muted-foreground flex items-center justify-between gap-2">
                            <span className="truncate">
                              🕒 <strong>{flat.timeline[0].title}</strong>
                            </span>
                            <span className="shrink-0 font-mono text-[10px]">
                              {formatShortDate(flat.timeline[0].date)}
                            </span>
                          </div>
                        )}
                      </CardContent>

                      <CardFooter className="px-4 py-2.5 bg-muted/20 border-t flex items-center justify-between text-xs">
                        <span className="text-[11px] font-semibold text-muted-foreground">
                          {flat.timeline?.length || 0} registro(s) no histórico
                        </span>
                        <span className="font-bold text-primary flex items-center gap-1">
                          <span>Abrir Raio-X 360º</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </span>
                      </CardFooter>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ══════════════════════════════════════════════════════════════════
              ABA 2: CAMPANHAS & SERVIÇOS EXTERNOS (TERCEIRIZADOS)
             ══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="campaigns" className="focus-visible:outline-none">
            <ServiceOrders embedded />
          </TabsContent>

          {/* ══════════════════════════════════════════════════════════════════
              ABA 3: TAREFAS PREVENTIVAS RECORRENTES (CAMAREIRA & ADMIN)
             ══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="preventives" className="focus-visible:outline-none">
            <Tasks embedded />
          </TabsContent>

          {/* ══════════════════════════════════════════════════════════════════
              ABA 4: OCORRÊNCIAS & AVARIAS DOS FLATS
             ══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="issues" className="focus-visible:outline-none">
            <Observations embedded />
          </TabsContent>

          {/* ══════════════════════════════════════════════════════════════════
              ABA 5: VISTORIAS & PESQUISAS OPERACIONAIS DAS CAMAREIRAS
             ══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="surveys" className="focus-visible:outline-none">
            <SurveysPage embedded />
          </TabsContent>
        </Tabs>

        {/* ════════════════════════════════════════════════════════════════════
            MODAL: PRONTUÁRIO 360º DO FLAT (DIÁRIO + FICHA TÉCNICA/76 TAGS + PREVENTIVAS/VISTORIAS)
           ════════════════════════════════════════════════════════════════════ */}
        <Dialog open={Boolean(selectedFlat)} onOpenChange={(open) => !open && setSelectedFlatId(null)}>
          <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto rounded-3xl p-4 sm:p-6">
            {selectedFlat && (
              <>
                <DialogHeader className="border-b pb-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-primary text-primary-foreground font-black text-xl flex items-center justify-center shadow-xs">
                        {selectedFlat.number}
                      </div>
                      <div>
                        <DialogTitle className="text-xl font-black flex items-center gap-2">
                          <span>Prontuário & Raio-X — Flat {selectedFlat.number}</span>
                          <Badge variant="outline" className="text-xs">
                            {selectedFlat.floor}º Andar
                          </Badge>
                        </DialogTitle>
                        <DialogDescription className="text-xs mt-0.5">
                          Histórico unificado de manutenções, itens retirados, ficha técnica, 76 tags e vistorias de camareiras.
                        </DialogDescription>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => openNewDiaryModal({ flatIds: [selectedFlat.id] })}
                        className="h-8 text-xs font-bold gap-1.5 rounded-xl"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Registrar no Diário</span>
                      </Button>
                    </div>
                  </div>

                  {/* Sub-abas do Prontuário do Flat */}
                  <div className="grid grid-cols-3 gap-1.5 pt-3">
                    <Button
                      type="button"
                      variant={prontuarioTab === "timeline" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setProntuarioTab("timeline")}
                      className="h-9 text-xs font-bold rounded-xl gap-1.5"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>📜 Diário & Linha do Tempo ({selectedFlat.timeline?.length || 0})</span>
                    </Button>
                    <Button
                      type="button"
                      variant={prontuarioTab === "tech_tags" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setProntuarioTab("tech_tags")}
                      className="h-9 text-xs font-bold rounded-xl gap-1.5"
                    >
                      <Tag className="w-3.5 h-3.5" />
                      <span>🏷️ O Que Tem no Flat (Ficha & Tags)</span>
                    </Button>
                    <Button
                      type="button"
                      variant={prontuarioTab === "preventives_surveys" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setProntuarioTab("preventives_surveys")}
                      className="h-9 text-xs font-bold rounded-xl gap-1.5"
                    >
                      <ClipboardCheck className="w-3.5 h-3.5" />
                      <span>🔄 Preventivas & Vistorias</span>
                    </Button>
                  </div>
                </DialogHeader>

                {/* ── SUB-ABA 1: DIÁRIO & LINHA DO TEMPO UNIFICADA DO FLAT ── */}
                {prontuarioTab === "timeline" && (
                  <div className="space-y-4 py-3">
                    {/* Resumo de Cobertura Oficial neste Flat */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {catalog.slice(0, 8).map((cat) => {
                        const cov = selectedFlat.serviceCoverage?.[cat.id];
                        return (
                          <div
                            key={cat.id}
                            onClick={() =>
                              openNewDiaryModal({
                                flatIds: [selectedFlat.id],
                                serviceTypeId: cat.id,
                                title: cat.name,
                                isRemovedItem: Boolean(cat.tracksRemovedItem),
                              })
                            }
                            className="cursor-pointer p-2.5 rounded-2xl border bg-muted/20 hover:bg-muted/50 transition-all space-y-1"
                            title="Clique para registrar nova execução deste serviço neste flat"
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-xs font-bold truncate">
                                {cat.icon} {cat.name}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[11px]">
                              <span
                                className={`font-bold ${
                                  cov?.status === "done"
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : cov?.status === "in_progress"
                                    ? "text-sky-600"
                                    : "text-amber-600"
                                }`}
                              >
                                {cov?.lastDoneAt
                                  ? `✓ ${formatShortDate(cov.lastDoneAt)}`
                                  : cov?.status === "in_progress"
                                  ? "⏳ Em andamento"
                                  : "Não registrado"}
                              </span>
                              <span className="text-[10px] text-primary font-semibold">+ Registrar</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Lista Cronológica de Eventos (Diário + Serviços + Preventivas + Ocorrências + Vistorias) */}
                    <div className="space-y-2.5">
                      <h4 className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                        Histórico Cronológico Completo do Flat {selectedFlat.number}
                      </h4>

                      {(!selectedFlat.timeline || selectedFlat.timeline.length === 0) ? (
                        <div className="p-8 rounded-2xl border border-dashed text-center text-xs text-muted-foreground">
                          Nenhum evento registrado ainda para este flat. Clique em "Registrar no Diário" acima para inaugurar o histórico!
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {selectedFlat.timeline.map((ev) => {
                            const typeBadge =
                              ev.type === "diary"
                                ? { label: "📓 Diário / Avulso", cls: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-300" }
                                : ev.type === "external_service"
                                ? { label: "🚀 Ordem de Serviço", cls: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-300" }
                                : ev.type === "preventive"
                                ? { label: "🔄 Preventiva", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-300" }
                                : ev.type === "observation"
                                ? { label: "⚠️ Ocorrência", cls: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-300" }
                                : { label: "📋 Vistoria Camareira", cls: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-300" };

                            return (
                              <div
                                key={ev.id}
                                className="p-3.5 rounded-2xl border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                              >
                                <div className="space-y-1 flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Badge variant="outline" className={`text-[10px] font-bold ${typeBadge.cls}`}>
                                      {typeBadge.label}
                                    </Badge>
                                    {ev.status === "in_progress_outside" && (
                                      <Badge className="bg-amber-500 text-white text-[10px] font-bold">
                                        🪟 Item Fora do Flat ({ev.itemDestination || "Lavanderia"})
                                      </Badge>
                                    )}
                                    <span className="font-bold text-sm text-foreground">{ev.title}</span>
                                  </div>

                                  {ev.description && (
                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                      {ev.description}
                                    </p>
                                  )}

                                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground pt-0.5">
                                    <span>📅 {formatDateTimePt(ev.date)}</span>
                                    {ev.performedBy && <span>👤 {ev.performedBy}</span>}
                                    {ev.returnedAt && (
                                      <span className="text-emerald-600 font-semibold">
                                        ✓ Devolvido em {formatShortDate(ev.returnedAt)}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  {ev.type === "diary" && ev.status === "in_progress_outside" && (
                                    <Button
                                      size="sm"
                                      onClick={() => returnItemMutation.mutate(ev.rawId)}
                                      className="h-8 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white gap-1 rounded-xl"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                      <span>Devolver ao Flat</span>
                                    </Button>
                                  )}
                                  {ev.type === "diary" && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => deleteDiaryEntryMutation.mutate(ev.rawId)}
                                      className="h-8 w-8 text-rose-500 hover:text-rose-600 hover:bg-rose-50"
                                      title="Excluir registro do diário"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── SUB-ABA 2: O QUE TEM NO FLAT (FICHA TÉCNICA ESTRUTURADA + 76 TAGS) ── */}
                {prontuarioTab === "tech_tags" && (
                  <div className="space-y-5 py-3">
                    {/* Bloco 1: Ficha Técnica Estruturada de Equipamentos & Medidas */}
                    <div className="p-4 rounded-2xl border bg-muted/20 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-black text-foreground flex items-center gap-1.5">
                            <Wrench className="w-4 h-4 text-primary" />
                            <span>Ficha Técnica de Equipamentos & Medidas do Flat {selectedFlat.number}</span>
                          </h4>
                          <p className="text-xs text-muted-foreground">
                            Registre modelos, BTUs, medidas de cortina/blackout, pilhas de fechadura e inventário do apartamento.
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs font-bold">Tipo de Ar-Condicionado</Label>
                          <Select value={editAcType} onValueChange={(v) => setEditAcType(v as "split" | "janela")}>
                            <SelectTrigger className="h-9 text-xs rounded-xl bg-background">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="split">❄️ Ar Split</SelectItem>
                              <SelectItem value="janela">🪟 Ar de Janela</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs font-bold">Marca / Modelo / BTUs do AC</Label>
                          <Input
                            placeholder="Ex: LG Dual Inverter 12.000 BTUs"
                            value={editTechSheet.acModel || ""}
                            onChange={(e) => setEditTechSheet((p) => ({ ...p, acModel: e.target.value }))}
                            className="h-9 text-xs rounded-xl bg-background"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs font-bold">Medida da Cortina / Blackout</Label>
                          <Input
                            placeholder="Ex: 2,80m x 2,30m (Trilho Suíço)"
                            value={editTechSheet.curtainMeasure || ""}
                            onChange={(e) => setEditTechSheet((p) => ({ ...p, curtainMeasure: e.target.value }))}
                            className="h-9 text-xs rounded-xl bg-background"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs font-bold">Configuração Principal de Cama</Label>
                          <Select value={editBedType} onValueChange={(v) => setEditBedType(v as "casal" | "solteiro_duplo")}>
                            <SelectTrigger className="h-9 text-xs rounded-xl bg-background">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="casal">🛏️ Cama de Casal</SelectItem>
                              <SelectItem value="solteiro_duplo">🛏️ 2 Camas de Solteiro</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs font-bold">Detalhes do Colchão / Cama</Label>
                          <Input
                            placeholder="Ex: Ortobom Queen Molas Ensacadas"
                            value={editTechSheet.bedDetails || ""}
                            onChange={(e) => setEditTechSheet((p) => ({ ...p, bedDetails: e.target.value }))}
                            className="h-9 text-xs rounded-xl bg-background"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs font-bold">Fechadura Digital & Pilhas</Label>
                          <Input
                            placeholder="Ex: Intelbras FR101 (4 pilhas AA)"
                            value={editTechSheet.lockModel || ""}
                            onChange={(e) => setEditTechSheet((p) => ({ ...p, lockModel: e.target.value }))}
                            className="h-9 text-xs rounded-xl bg-background"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs font-bold">Modelo da TV / Polegadas</Label>
                          <Input
                            placeholder="Ex: Smart TV Samsung 43” Roku"
                            value={editTechSheet.tvModel || ""}
                            onChange={(e) => setEditTechSheet((p) => ({ ...p, tvModel: e.target.value }))}
                            className="h-9 text-xs rounded-xl bg-background"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs font-bold">Modelo do Chuveiro / Aquecimento</Label>
                          <Input
                            placeholder="Ex: Lorenzetti Acqua Ultra 220V"
                            value={editTechSheet.showerModel || ""}
                            onChange={(e) => setEditTechSheet((p) => ({ ...p, showerModel: e.target.value }))}
                            className="h-9 text-xs rounded-xl bg-background"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs font-bold">Possui Micro-ondas?</Label>
                          <div className="flex items-center gap-2 h-9 px-3 rounded-xl border bg-background">
                            <Checkbox
                              checked={editHasMicrowave}
                              onCheckedChange={(v) => setEditHasMicrowave(Boolean(v))}
                              id="chk-microwave"
                            />
                            <Label htmlFor="chk-microwave" className="text-xs font-semibold cursor-pointer">
                              Sim, possui Micro-ondas
                            </Label>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div className="space-y-1">
                          <Label className="text-xs font-bold">Inventário Fixo / Enxoval / Observações Técnicas</Label>
                          <Textarea
                            rows={2}
                            placeholder="Ex: 2 controles (AC + TV), 4 travesseiros, cafeteira Dolce Gusto preta, blackout novo..."
                            value={editTechSheet.inventoryNotes || ""}
                            onChange={(e) => setEditTechSheet((p) => ({ ...p, inventoryNotes: e.target.value }))}
                            className="text-xs rounded-xl bg-background"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-bold">Notas Gerais do Flat (Visível no Calendário PMS & Sofia)</Label>
                          <Textarea
                            rows={2}
                            placeholder="Ex: Flat silencioso de frente, ideal para estadias longas..."
                            value={editNotes}
                            onChange={(e) => setEditNotes(e.target.value)}
                            className="text-xs rounded-xl bg-background"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Bloco 2: Catálogo Oficial das 76 Tags & Comodidades */}
                    <div className="p-4 rounded-2xl border bg-card space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <h4 className="text-sm font-black text-foreground flex items-center gap-1.5">
                            <Tag className="w-4 h-4 text-primary" />
                            <span>Catálogo de 76 Tags & Comodidades do Flat ({editTags.length} ativas)</span>
                          </h4>
                          <p className="text-xs text-muted-foreground">
                            Clique nas tags para ativar ou desativar o que este flat possui. Sincronizado com o Calendário PMS e IA Sofia.
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Input
                            placeholder="Filtrar tag..."
                            value={tagSearch}
                            onChange={(e) => setTagSearch(e.target.value)}
                            className="h-8 text-xs w-40 rounded-xl"
                          />
                        </div>
                      </div>

                      {/* Abas de Categoria de Tags */}
                      <div className="flex flex-wrap gap-1">
                        {AMENITY_CATEGORIES.map((cat) => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setTagCategoryFilter(cat.id)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                              tagCategoryFilter === cat.id
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted/60 text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {cat.label}
                          </button>
                        ))}
                      </div>

                      {/* Grid das 76 Tags */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-60 overflow-y-auto p-1">
                        {FLAT_AMENITIES_CATALOG.filter((a) => {
                          if (tagCategoryFilter !== "all" && a.category !== tagCategoryFilter) return false;
                          if (tagSearch.trim() && !a.label.toLowerCase().includes(tagSearch.toLowerCase())) return false;
                          return true;
                        }).map((amenity) => {
                          const isChecked = editTags.some(
                            (t) =>
                              t.toLowerCase() === amenity.label.toLowerCase() ||
                              t.toLowerCase() === amenity.id.toLowerCase()
                          );
                          return (
                            <button
                              key={amenity.id}
                              type="button"
                              onClick={() => handleToggleAmenityTag(amenity.label, amenity.id)}
                              className={`p-2 rounded-xl border text-left text-xs flex items-center gap-2 transition-all ${
                                isChecked
                                  ? "border-primary bg-primary/10 font-bold text-foreground shadow-2xs"
                                  : "border-border/60 hover:bg-muted/40 text-muted-foreground"
                              }`}
                            >
                              {renderAmenityIcon(amenity.iconName, `w-3.5 h-3.5 shrink-0 ${amenity.colorClass || "text-primary"}`)}
                              <span className="truncate flex-1">{amenity.label}</span>
                              {isChecked && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                            </button>
                          );
                        })}
                      </div>

                      {/* Adicionar Tag Personalizada */}
                      <div className="flex items-center gap-2 pt-2 border-t">
                        <Input
                          placeholder="Adicionar tag personalizada (ex: Cortina Nova 2026, Colchão Extra)..."
                          value={customTagInput}
                          onChange={(e) => setCustomTagInput(e.target.value)}
                          className="h-8 text-xs rounded-xl"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (customTagInput.trim()) {
                              setEditTags((prev) => [...prev, customTagInput.trim()]);
                              setCustomTagInput("");
                            }
                          }}
                          className="h-8 text-xs font-bold rounded-xl shrink-0"
                        >
                          + Tag
                        </Button>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button
                        onClick={() => saveFlatTechAndTagsMutation.mutate(undefined)}
                        disabled={saveFlatTechAndTagsMutation.isPending}
                        className="font-bold gap-2 rounded-xl px-6"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>
                          {saveFlatTechAndTagsMutation.isPending
                            ? "Salvando Ficha Técnica & Tags..."
                            : "Salvar Ficha Técnica & Tags do Flat"}
                        </span>
                      </Button>
                    </div>
                  </div>
                )}

                {/* ── SUB-ABA 3: PREVENTIVAS RECORRENTES & VISTORIAS DE CAMAREIRAS DESTE FLAT ── */}
                {prontuarioTab === "preventives_surveys" && (
                  <div className="space-y-5 py-3">
                    {/* Seção A: Tarefas Preventivas Recorrentes deste Flat */}
                    <div className="space-y-2.5">
                      <h4 className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-emerald-600" />
                        <span>Tarefas Preventivas Programadas neste Flat ({selectedFlat.preventiveStatuses?.length || 0})</span>
                      </h4>

                      {(!selectedFlat.preventiveStatuses || selectedFlat.preventiveStatuses.length === 0) ? (
                        <div className="p-6 rounded-2xl border border-dashed text-center text-xs text-muted-foreground">
                          Nenhuma tarefa preventiva ativa vinculada a este flat.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {selectedFlat.preventiveStatuses.map((p: any) => (
                            <div
                              key={p.taskId}
                              className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
                                p.isOverdue
                                  ? "border-rose-400/70 bg-rose-500/5"
                                  : "border-border bg-card"
                              }`}
                            >
                              <div className="space-y-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] font-bold"
                                  >
                                    {p.assignToHousekeeping ? "🧹 Camareira" : "🛠️ Admin"}
                                  </Badge>
                                  <span className="font-bold text-xs text-foreground">{p.taskName}</span>
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                  Ciclo: a cada {p.periodDays}d{" "}
                                  {p.periodType === "occupied_days" ? "de locação" : "corridos"} • Última:{" "}
                                  {formatShortDate(p.lastExecutedAt)}
                                </p>
                                {p.isOverdue ? (
                                  <Badge className="bg-rose-600 text-white text-[10px] font-bold">
                                    Vencida ({p.daysOverdue}d)
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300">
                                    ✓ Em dia
                                  </Badge>
                                )}
                              </div>

                              <Button
                                size="sm"
                                variant={p.isOverdue ? "default" : "outline"}
                                onClick={() =>
                                  executePreventiveMutation.mutate({
                                    taskId: p.taskId,
                                    flatId: selectedFlat.id,
                                  })
                                }
                                disabled={executePreventiveMutation.isPending}
                                className="h-8 text-xs font-bold rounded-xl shrink-0 gap-1"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Executar</span>
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Seção B: Respostas de Vistorias das Camareiras neste Flat (com 1-clique para Ficha Técnica ou Diário) */}
                    <div className="space-y-2.5 pt-2 border-t">
                      <h4 className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <ClipboardCheck className="w-4 h-4 text-sky-600" />
                        <span>Vistorias Respondidas pelas Camareiras neste Flat ({selectedFlat.surveyResponses?.length || 0})</span>
                      </h4>

                      {(!selectedFlat.surveyResponses || selectedFlat.surveyResponses.length === 0) ? (
                        <div className="p-6 rounded-2xl border border-dashed text-center text-xs text-muted-foreground">
                          Nenhuma vistoria respondida para este flat até o momento.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {selectedFlat.surveyResponses.map((sr: any) => {
                            const summaryText = (sr.answers || [])
                              .map((a: any) => `${a.questionText}: ${Array.isArray(a.answer) ? a.answer.join(", ") : a.answer}`)
                              .join(" | ");

                            return (
                              <div key={sr.responseId} className="p-4 rounded-2xl border bg-card space-y-3">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2">
                                  <div>
                                    <span className="font-black text-sm text-foreground">
                                      📋 {sr.surveyTitle}
                                    </span>
                                    <span className="text-[11px] text-muted-foreground block">
                                      Respondido por <strong>{sr.answeredBy}</strong> em{" "}
                                      {formatDateTimePt(sr.answeredAt)}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        const currentNotes = selectedFlat.technicalSheet?.inventoryNotes || "";
                                        const nextNotes = currentNotes
                                          ? `${currentNotes}\n[Vistoria ${formatShortDate(sr.answeredAt)} - ${sr.surveyTitle}]: ${summaryText}`
                                          : `[Vistoria ${formatShortDate(sr.answeredAt)} - ${sr.surveyTitle}]: ${summaryText}`;
                                        setEditTechSheet((p) => ({ ...p, inventoryNotes: nextNotes }));
                                        saveFlatTechAndTagsMutation.mutate({
                                          flatId: selectedFlat.id,
                                          technicalSheet: {
                                            ...selectedFlat.technicalSheet,
                                            inventoryNotes: nextNotes,
                                          },
                                        });
                                      }}
                                      className="h-7 text-[11px] font-bold gap-1 rounded-lg border-primary/30 text-primary"
                                    >
                                      <span>📌 Salvar na Ficha Técnica</span>
                                    </Button>

                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() =>
                                        openNewDiaryModal({
                                          flatIds: [selectedFlat.id],
                                          title: `Ação pós-vistoria: ${sr.surveyTitle}`,
                                          description: summaryText,
                                        })
                                      }
                                      className="h-7 text-[11px] font-bold gap-1 rounded-lg"
                                    >
                                      <span>🛠️ Gerar Ação no Diário</span>
                                    </Button>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {(sr.answers || []).map((ans: any, idx: number) => (
                                    <div key={idx} className="p-2.5 rounded-xl bg-muted/30 border text-xs space-y-1">
                                      <span className="text-[11px] text-muted-foreground font-semibold block">
                                        {ans.questionText}
                                      </span>
                                      <span className="font-bold text-foreground block">
                                        {Array.isArray(ans.answer) ? ans.answer.join(", ") : String(ans.answer || "-")}
                                      </span>
                                      {ans.photoUrl && (
                                        <a
                                          href={ans.photoUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-[10px] text-primary underline inline-block pt-0.5"
                                        >
                                          📷 Ver foto anexada
                                        </a>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* ════════════════════════════════════════════════════════════════════
            MODAL: NOVO REGISTRO NO DIÁRIO DO FLAT / RETIRADA DE ITEM (CORTINA ETC.)
           ════════════════════════════════════════════════════════════════════ */}
        <Dialog open={diaryModalOpen} onOpenChange={setDiaryModalOpen}>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl">
            <DialogHeader>
              <DialogTitle className="text-lg font-black flex items-center gap-2">
                {diaryIsRemovedItem ? (
                  <>
                    <PackageOpen className="w-5 h-5 text-amber-600" />
                    <span>Registrar Retirada de Item do Flat (Ex: Cortina para Lavar)</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5 text-primary" />
                    <span>Registrar Execução no Diário dos Flats</span>
                  </>
                )}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Selecione um ou mais apartamentos para registrar um serviço concluído ou controlar um item retirado temporariamente.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2 text-xs">
              {/* Alternador: Serviço Concluído vs. Item Retirado para Lavar/Consertar */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-xl">
                <button
                  type="button"
                  onClick={() => setDiaryIsRemovedItem(false)}
                  className={`py-2 px-3 rounded-lg font-bold transition-all ${
                    !diaryIsRemovedItem ? "bg-background text-foreground shadow-2xs" : "text-muted-foreground"
                  }`}
                >
                  ✓ Serviço / Manutenção Concluída
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDiaryIsRemovedItem(true);
                    setDiaryServiceTypeId("lavagem_cortina");
                    if (!diaryTitle) setDiaryTitle("Retirada de Cortina para Lavar");
                  }}
                  className={`py-2 px-3 rounded-lg font-bold transition-all ${
                    diaryIsRemovedItem ? "bg-amber-500 text-white shadow-2xs" : "text-muted-foreground"
                  }`}
                >
                  🪟 Item Retirado (Fora do Flat)
                </button>
              </div>

              {/* Tipo de Serviço do Catálogo */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Tipo de Serviço (Atualiza a Matriz de Cobertura)</Label>
                <Select
                  value={diaryServiceTypeId}
                  onValueChange={(val) => {
                    setDiaryServiceTypeId(val);
                    const cat = catalog.find((c) => c.id === val);
                    if (cat) {
                      setDiaryTitle(cat.name);
                      if (cat.tracksRemovedItem) setDiaryIsRemovedItem(true);
                    }
                  }}
                >
                  <SelectTrigger className="h-9 text-xs rounded-xl">
                    <SelectValue placeholder="Selecione o tipo de serviço..." />
                  </SelectTrigger>
                  <SelectContent>
                    {catalog.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.icon} {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Título */}
              <div className="space-y-1">
                <Label className="text-xs font-bold">Título do Registro *</Label>
                <Input
                  value={diaryTitle}
                  onChange={(e) => setDiaryTitle(e.target.value)}
                  placeholder="Ex: Higienização de Ar-Condicionado, Tirei cortina para lavar..."
                  className="h-9 text-xs font-semibold rounded-xl"
                />
              </div>

              {/* Campos extras caso seja Item Retirado */}
              {diaryIsRemovedItem && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-2xl bg-amber-500/10 border border-amber-300">
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-amber-950 dark:text-amber-200">
                      Qual item foi retirado do flat? *
                    </Label>
                    <Input
                      value={diaryItemRemoved}
                      onChange={(e) => setDiaryItemRemoved(e.target.value)}
                      placeholder="Ex: Cortina Blackout da Sala, Tapete, TV..."
                      className="h-8 text-xs bg-background rounded-lg"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-amber-950 dark:text-amber-200">
                      Onde o item está? (Destino)
                    </Label>
                    <Input
                      value={diaryItemDestination}
                      onChange={(e) => setDiaryItemDestination(e.target.value)}
                      placeholder="Ex: Lavanderia Externa, Assistência..."
                      className="h-8 text-xs bg-background rounded-lg"
                    />
                  </div>
                </div>
              )}

              {/* Data e Responsável */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-bold">Data da Execução / Retirada</Label>
                  <Input
                    type="date"
                    value={diaryPerformedAt}
                    onChange={(e) => setDiaryPerformedAt(e.target.value)}
                    className="h-9 text-xs rounded-xl"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">Executado por (Opcional)</Label>
                  <Input
                    value={diaryPerformedBy}
                    onChange={(e) => setDiaryPerformedBy(e.target.value)}
                    placeholder="Ex: Miller, Técnico João, Camareira..."
                    className="h-9 text-xs rounded-xl"
                  />
                </div>
              </div>

              {/* Observações */}
              <div className="space-y-1">
                <Label className="text-xs font-bold">Observações / Detalhes (Opcional)</Label>
                <Textarea
                  rows={2}
                  value={diaryDescription}
                  onChange={(e) => setDiaryDescription(e.target.value)}
                  placeholder="Ex: Limpeza completa da serpentina e bandeja, aplicação de bactericida..."
                  className="text-xs rounded-xl"
                />
              </div>

              {/* Seleção de Flats (Suporta 1 ou vários flats de uma vez!) */}
              <div className="space-y-2 pt-1 border-t">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold">
                    Flats onde foi realizado ({diaryFlatIds.length} selecionado{diaryFlatIds.length !== 1 ? "s" : ""}) *
                  </Label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setDiaryFlatIds(flats.map((f) => f.id))}
                      className="text-[11px] font-bold text-primary hover:underline"
                    >
                      Todos os 19
                    </button>
                    <button
                      type="button"
                      onClick={() => setDiaryFlatIds([])}
                      className="text-[11px] text-muted-foreground hover:underline"
                    >
                      Limpar
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 max-h-40 overflow-y-auto p-2 rounded-xl border bg-muted/20">
                  {flats.map((f) => {
                    const checked = diaryFlatIds.includes(f.id);
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() =>
                          setDiaryFlatIds((prev) =>
                            prev.includes(f.id) ? prev.filter((id) => id !== f.id) : [...prev, f.id]
                          )
                        }
                        className={`p-2 rounded-lg border text-xs font-bold transition-all flex items-center justify-between ${
                          checked
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background hover:bg-muted"
                        }`}
                      >
                        <span>{f.number}</span>
                        {checked && <Check className="w-3 h-3" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setDiaryModalOpen(false)} className="rounded-xl text-xs">
                Cancelar
              </Button>
              <Button
                onClick={() => createDiaryMutation.mutate()}
                disabled={createDiaryMutation.isPending}
                className="rounded-xl text-xs font-bold"
              >
                {createDiaryMutation.isPending ? "Salvando..." : "Salvar no Diário dos Flats"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ════════════════════════════════════════════════════════════════════
            MODAL: GERENCIAR CATÁLOGO OFICIAL DE SERVIÇOS RECORRENTES
           ════════════════════════════════════════════════════════════════════ */}
        <Dialog open={catalogModalOpen} onOpenChange={setCatalogModalOpen}>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl">
            <DialogHeader>
              <DialogTitle className="text-lg font-black flex items-center gap-2">
                <Settings className="w-5 h-5 text-primary" />
                <span>Catálogo Oficial de Serviços & Campanhas</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                Gerencie a lista oficial de serviços monitorados na Matriz de Cobertura dos 19 Flats (ex: Higienização de A/C, Dedetização, Lavagem de Cortinas).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2 text-xs">
              {/* Formulário para adicionar novo tipo */}
              <div className="p-3.5 rounded-2xl border bg-muted/30 space-y-3">
                <span className="font-bold text-foreground block">+ Adicionar Novo Tipo de Serviço à Lista:</span>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <Input
                    placeholder="Ícone (❄️)"
                    value={newCatIcon}
                    onChange={(e) => setNewCatIcon(e.target.value)}
                    className="h-9 text-xs sm:col-span-1 bg-background"
                  />
                  <Input
                    placeholder="Nome (ex: Impermeabilização de Sofá)"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    className="h-9 text-xs sm:col-span-2 bg-background"
                  />
                  <Input
                    type="number"
                    placeholder="Ciclo dias (180)"
                    value={newCatInterval}
                    onChange={(e) => setNewCatInterval(e.target.value)}
                    className="h-9 text-xs sm:col-span-1 bg-background"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={newCatTracksRemoved}
                      onCheckedChange={(v) => setNewCatTracksRemoved(Boolean(v))}
                    />
                    <span>Controla retirada de item do flat (ex: Cortina, Tapete)</span>
                  </label>
                  <Button
                    size="sm"
                    onClick={() => addCatalogMutation.mutate()}
                    disabled={addCatalogMutation.isPending}
                    className="h-8 text-xs font-bold rounded-xl"
                  >
                    Adicionar ao Catálogo
                  </Button>
                </div>
              </div>

              {/* Lista atual */}
              <div className="space-y-2">
                {catalog.map((cat) => (
                  <div
                    key={cat.id}
                    className="p-3 rounded-xl border bg-card flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg">{cat.icon || "🔧"}</span>
                      <div>
                        <span className="font-bold text-xs text-foreground block">{cat.name}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {cat.recommendedIntervalDays
                            ? `Recorrência sugerida: a cada ${cat.recommendedIntervalDays} dias`
                            : "Sob demanda"}
                          {cat.tracksRemovedItem ? " • Controla item retirado do flat" : ""}
                        </span>
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteCatalogMutation.mutate(cat.id)}
                      className="h-8 w-8 text-rose-500 hover:bg-rose-50"
                      title="Remover do catálogo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Shell>
  );
}
