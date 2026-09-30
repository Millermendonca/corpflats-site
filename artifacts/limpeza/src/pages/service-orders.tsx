import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useListFlats } from "@workspace/api-client-react";
import { Shell } from "@/components/layout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  Wrench,
  Plus,
  Copy,
  ExternalLink,
  Edit,
  Power,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RotateCcw,
  Camera,
  FileText,
  List,
  Sparkles,
  Trash2,
  Users,
  Eye,
  Check,
  X,
  RefreshCw,
  Search,
  Building,
  AlertCircle,
  ArrowLeft,
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
  Layers,
  Image as ImageIcon
} from "lucide-react";

export type CleanFlatMode = "never" | "priority" | "always";
export type OrderStatus = "draft" | "active" | "closed";
export type FlatServiceStatus = "pending" | "in_progress" | "done";
export type InstructionFormat = "text" | "list";

export interface ServiceFlat {
  flatId: number;
  flatNumber: string;
  instructions?: string;
  status: FlatServiceStatus;
  startedAt?: string | null;
  finishedAt?: string | null;
  workerName?: string | null;
  workerCpf?: string | null;
  estimatedFinishAt?: string | null;
  observations?: string | null;
  photos?: string[];
  needsCleaning?: boolean | null;
}

export interface ServiceOrder {
  id: string;
  title: string;
  token: string;
  status: OrderStatus;
  createdAt: string;
  createdBy?: string;
  cleanFlatMode: CleanFlatMode;
  maxSimultaneousFlats: number;
  maxFlatsPerDay: number;
  requirePhotos: boolean;
  estimatedDurationHours?: number | null;
  instructionFormat: InstructionFormat;
  defaultInstructions?: string;
  flats: ServiceFlat[];
}

export interface ProgressWorker {
  id?: string;
  mainWorker?: { name: string; cpf: string };
  collaborators?: Array<{ name: string; cpf: string }>;
  registeredAt?: string;
}

export interface ServiceOrderProgressResponse {
  orderId: string;
  title: string;
  token: string;
  status: OrderStatus;
  stats: {
    total: number;
    done: number;
    inProgress: number;
    pending: number;
    percentage: number;
  };
  worker: ProgressWorker | null;
  flats: ServiceFlat[];
}

// Helpers de formatação
function formatDateTime(iso?: string | null): string {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "-";
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

function formatDuration(startIso?: string | null, endIso?: string | null): string {
  if (!startIso || !endIso) return "";
  try {
    const start = new Date(startIso).getTime();
    const end = new Date(endIso).getTime();
    const diffMinutes = Math.max(0, Math.round((end - start) / (1000 * 60)));
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    if (hours > 0) {
      return `${hours}h ${minutes}min`;
    }
    return `${minutes}min`;
  } catch {
    return "";
  }
}

function formatCpf(cpf?: string | null): string {
  if (!cpf) return "";
  const cleaned = cpf.replace(/\D/g, "");
  if (cleaned.length === 11) {
    return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.***.***-$4");
  }
  return cpf;
}

export default function ServiceOrders() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Tab State: "list" | "form" | "tracking"
  const [activeTab, setActiveTab] = useState<"list" | "form" | "tracking">("list");

  // Flat selection and raw list
  const { data: rawFlats, isLoading: flatsLoading } = useListFlats();
  const activeFlats = useMemo(() => {
    return (rawFlats || [])
      .filter((f: any) => f.isActive !== false)
      .sort((a: any, b: any) => {
        const numA = parseInt(a.number, 10) || 0;
        const numB = parseInt(b.number, 10) || 0;
        return numA - numB;
      });
  }, [rawFlats]);

  // Query: Lista de Ordens de Serviço
  const {
    data: orders = [],
    isLoading: ordersLoading,
    refetch: refetchOrders,
  } = useQuery<ServiceOrder[]>({
    queryKey: ["service-orders"],
    queryFn: async () => {
      const res = await fetch("/api/service-orders", { credentials: "include" });
      if (!res.ok) {
        throw new Error("Erro ao carregar ordens de serviço.");
      }
      return res.json();
    },
    refetchInterval: 15000,
  });

  // Selected Order for Tracking Tab
  const [selectedTrackingOrderId, setSelectedTrackingOrderId] = useState<string>("");

  const effectiveTrackingOrderId = useMemo(() => {
    if (selectedTrackingOrderId) return selectedTrackingOrderId;
    if (orders.length > 0) return orders[0].id;
    return "";
  }, [selectedTrackingOrderId, orders]);

  // Query: Progresso em Tempo Real (Polling a cada 10s)
  const {
    data: progressData,
    isLoading: progressLoading,
    isFetching: progressFetching,
    refetch: refetchProgress,
  } = useQuery<ServiceOrderProgressResponse>({
    queryKey: ["service-order-progress", effectiveTrackingOrderId],
    queryFn: async () => {
      if (!effectiveTrackingOrderId) return null as any;
      const res = await fetch(`/api/service-orders/${effectiveTrackingOrderId}/progress`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Erro ao carregar acompanhamento.");
      return res.json();
    },
    enabled: Boolean(effectiveTrackingOrderId),
    refetchInterval: 10000,
  });

  // Tracking Table Filters & Modals
  const [trackingStatusFilter, setTrackingStatusFilter] = useState<string>("all");
  const [detailModalFlat, setDetailModalFlat] = useState<ServiceFlat | null>(null);
  const [zoomPhotoUrl, setZoomPhotoUrl] = useState<string | null>(null);
  const [resetConfirmFlat, setResetConfirmFlat] = useState<ServiceFlat | null>(null);
  const [deleteConfirmOrderId, setDeleteConfirmOrderId] = useState<string | null>(null);

  // Search & Status filter in List tab
  const [listSearch, setListSearch] = useState("");
  const [listStatusFilter, setListStatusFilter] = useState<string>("all");

  // Form State (Criar / Editar)
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formCleanFlatMode, setFormCleanFlatMode] = useState<CleanFlatMode>("priority");
  const [formMaxSimultaneous, setFormMaxSimultaneous] = useState<number>(2);
  const [formMaxPerDay, setFormMaxPerDay] = useState<number>(4);
  const [formRequirePhotos, setFormRequirePhotos] = useState<boolean>(true);
  const [formEstimatedDurationHours, setFormEstimatedDurationHours] = useState<number | "">(3);
  const [formInstructionFormat, setFormInstructionFormat] = useState<InstructionFormat>("text");
  const [formDefaultInstructions, setFormDefaultInstructions] = useState("");
  const [formSelectedFlatIds, setFormSelectedFlatIds] = useState<number[]>([]);
  const [formHasCustomInstructions, setFormHasCustomInstructions] = useState(false);
  const [formFlatCustomInstructions, setFormFlatCustomInstructions] = useState<Record<number, string>>({});

  // Reset form to blank creation state
  const resetFormToCreate = () => {
    setEditingOrderId(null);
    setFormTitle("");
    setFormCleanFlatMode("priority");
    setFormMaxSimultaneous(2);
    setFormMaxPerDay(4);
    setFormRequirePhotos(true);
    setFormEstimatedDurationHours(3);
    setFormInstructionFormat("text");
    setFormDefaultInstructions("");
    // Default select all 19 active flats
    setFormSelectedFlatIds(activeFlats.map((f: any) => f.id));
    setFormHasCustomInstructions(false);
    setFormFlatCustomInstructions({});
  };

  // Load existing order into form for editing
  const loadOrderIntoForm = (order: ServiceOrder) => {
    setEditingOrderId(order.id);
    setFormTitle(order.title || "");
    setFormCleanFlatMode(order.cleanFlatMode || "priority");
    setFormMaxSimultaneous(order.maxSimultaneousFlats || 2);
    setFormMaxPerDay(order.maxFlatsPerDay || 4);
    setFormRequirePhotos(order.requirePhotos ?? true);
    setFormEstimatedDurationHours(order.estimatedDurationHours ?? "");
    setFormInstructionFormat(order.instructionFormat || "text");
    setFormDefaultInstructions(order.defaultInstructions || "");

    const selectedIds = (order.flats || []).map((f) => f.flatId);
    setFormSelectedFlatIds(selectedIds);

    const customMap: Record<number, string> = {};
    let hasCustom = false;
    for (const f of order.flats || []) {
      if (f.instructions && f.instructions !== order.defaultInstructions) {
        customMap[f.flatId] = f.instructions;
        hasCustom = true;
      }
    }
    setFormHasCustomInstructions(hasCustom);
    setFormFlatCustomInstructions(customMap);
    setActiveTab("form");
  };

  // Mutation: Salvar Ordem (POST ou PATCH)
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!formTitle.trim()) {
        throw new Error("Informe o título do serviço.");
      }
      if (formSelectedFlatIds.length === 0) {
        throw new Error("Selecione pelo menos 1 apartamento para o serviço.");
      }

      const flatsPayload = formSelectedFlatIds.map((flatId) => {
        const flatObj = activeFlats.find((f: any) => f.id === flatId);
        const specificNote = formFlatCustomInstructions[flatId]?.trim();
        const finalInstructions =
          formHasCustomInstructions && specificNote
            ? specificNote
            : formDefaultInstructions.trim();

        return {
          flatId,
          flatNumber: flatObj?.number ? String(flatObj.number) : String(flatId),
          instructions: finalInstructions,
        };
      });

      const bodyPayload = {
        title: formTitle.trim(),
        cleanFlatMode: formCleanFlatMode,
        maxSimultaneousFlats: Number(formMaxSimultaneous) || 2,
        maxFlatsPerDay: Number(formMaxPerDay) || 4,
        requirePhotos: Boolean(formRequirePhotos),
        estimatedDurationHours: formEstimatedDurationHours ? Number(formEstimatedDurationHours) : null,
        instructionFormat: formInstructionFormat,
        defaultInstructions: formDefaultInstructions.trim(),
        flats: flatsPayload,
      };

      const url = editingOrderId
        ? `/api/service-orders/${editingOrderId}`
        : "/api/service-orders";
      const method = editingOrderId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(bodyPayload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Falha ao salvar ordem de serviço.");
      }
      return res.json();
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["service-orders"] });
      if (editingOrderId) {
        queryClient.invalidateQueries({ queryKey: ["service-order-progress", editingOrderId] });
      }
      toast({
        title: editingOrderId ? "Ordem atualizada com sucesso!" : "Ordem de serviço criada!",
        description: `Serviço "${saved.title || formTitle}" registrado com ${formSelectedFlatIds.length} flats.`,
      });
      setSelectedTrackingOrderId(saved.id || editingOrderId || "");
      setActiveTab("list");
    },
    onError: (err: any) => {
      toast({
        title: "Erro ao salvar",
        description: err.message || "Verifique os campos e tente novamente.",
        variant: "destructive",
      });
    },
  });

  // Mutation: Encerrar / Reativar Ordem
  const toggleStatusMutation = useMutation({
    mutationFn: async ({ orderId, nextStatus }: { orderId: string; nextStatus: OrderStatus }) => {
      const res = await fetch(`/api/service-orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Falha ao alterar status da ordem.");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["service-orders"] });
      queryClient.invalidateQueries({ queryKey: ["service-order-progress", data.id] });
      toast({
        title: data.status === "closed" ? "Ordem de serviço encerrada" : "Ordem de serviço reativada",
        description: `O status da ordem foi atualizado para "${data.status}".`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Erro",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Mutation: Excluir Ordem
  const deleteOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await fetch(`/api/service-orders/${orderId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Falha ao remover ordem de serviço.");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-orders"] });
      toast({
        title: "Ordem removida",
        description: "A ordem de serviço e os registros vinculados foram excluídos com sucesso.",
      });
      setDeleteConfirmOrderId(null);
    },
    onError: (err: any) => {
      toast({
        title: "Erro ao excluir",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Mutation: Resetar Flat para Pending
  const resetFlatMutation = useMutation({
    mutationFn: async ({ orderId, flatId }: { orderId: string; flatId: number }) => {
      const res = await fetch(`/api/service-orders/${orderId}/flats/${flatId}/reset`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Falha ao resetar flat.");
      }
      return res.json();
    },
    onSuccess: (data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["service-orders"] });
      queryClient.invalidateQueries({ queryKey: ["service-order-progress", vars.orderId] });
      toast({
        title: "Flat resetado para Pendente!",
        description: `O flat foi reaberto e está novamente liberado para o prestador de serviço.`,
      });
      setResetConfirmFlat(null);
      if (detailModalFlat && detailModalFlat.flatId === vars.flatId) {
        setDetailModalFlat((prev) => (prev ? { ...prev, status: "pending", finishedAt: null, startedAt: null } : null));
      }
    },
    onError: (err: any) => {
      toast({
        title: "Erro ao resetar flat",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Copy portal link helper
  const copyPortalLink = (token: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const portalUrl = `${origin}/servico/${token}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(portalUrl).then(
        () => {
          toast({
            title: "Link copiado!",
            description: "O link de acesso do prestador foi copiado para a área de transferência.",
          });
        },
        () => {
          fallbackCopyText(portalUrl);
        }
      );
    } else {
      fallbackCopyText(portalUrl);
    }
  };

  const fallbackCopyText = (text: string) => {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      toast({
        title: "Link copiado!",
        description: "O link de acesso do prestador foi copiado para a área de transferência.",
      });
    } catch {
      toast({
        title: "Não foi possível copiar automaticamente",
        description: text,
      });
    }
  };

  // Filtered orders in Tab 1
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesSearch =
        !listSearch.trim() ||
        order.title.toLowerCase().includes(listSearch.toLowerCase()) ||
        order.token.toLowerCase().includes(listSearch.toLowerCase());
      const matchesStatus =
        listStatusFilter === "all" || order.status === listStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [orders, listSearch, listStatusFilter]);

  // Tracking flats filtered
  const trackingFlats = useMemo(() => {
    if (!progressData?.flats) return [];
    if (trackingStatusFilter === "all") return progressData.flats;
    return progressData.flats.filter((f) => f.status === trackingStatusFilter);
  }, [progressData, trackingStatusFilter]);

  return (
    <Shell>
      <TooltipProvider>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* Header principal da página */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/40 pb-5">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shadow-xs">
                  <Wrench className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                    Ordens de Serviço de Terceirizados
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Gestão de pintores, eletricistas e reformas com portal exclusivo e controle de faxina
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <Button
                variant={activeTab === "form" && !editingOrderId ? "secondary" : "default"}
                onClick={() => {
                  resetFormToCreate();
                  setActiveTab("form");
                }}
                className="gap-2 font-medium shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Nova Ordem de Serviço</span>
              </Button>
            </div>
          </div>

          {/* Abas de Navegação Principais */}
          <Tabs
            value={activeTab}
            onValueChange={(val) => setActiveTab(val as "list" | "form" | "tracking")}
            className="w-full space-y-6"
          >
            <TabsList className="grid grid-cols-3 max-w-lg h-11 p-1 bg-muted/80 rounded-xl">
              <TabsTrigger value="list" className="gap-2 text-sm font-medium rounded-lg">
                <FileText className="w-4 h-4" />
                <span>Lista de Serviços</span>
                {orders.length > 0 && (
                  <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px] font-semibold">
                    {orders.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="form" className="gap-2 text-sm font-medium rounded-lg">
                <Edit className="w-4 h-4" />
                <span>{editingOrderId ? "Editar Ordem" : "Criar Ordem"}</span>
              </TabsTrigger>
              <TabsTrigger value="tracking" className="gap-2 text-sm font-medium rounded-lg">
                <Layers className="w-4 h-4" />
                <span>Acompanhamento</span>
                {progressData?.stats?.inProgress ? (
                  <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
                ) : null}
              </TabsTrigger>
            </TabsList>

            {/* ════════════════════════════════════════════════════════════════
                ABA 1: LISTA DE ORDENS DE SERVIÇO
               ════════════════════════════════════════════════════════════════ */}
            <TabsContent value="list" className="space-y-6 focus-visible:outline-none">
              {/* Barra de Filtros e Busca */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card p-3 rounded-2xl border shadow-xs">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por título ou token da ordem..."
                    value={listSearch}
                    onChange={(e) => setListSearch(e.target.value)}
                    className="pl-9 h-9 text-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Select value={listStatusFilter} onValueChange={setListStatusFilter}>
                    <SelectTrigger className="w-36 h-9 text-xs">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os Status</SelectItem>
                      <SelectItem value="active">Apenas Ativos</SelectItem>
                      <SelectItem value="closed">Apenas Encerrados</SelectItem>
                      <SelectItem value="draft">Rascunhos</SelectItem>
                    </SelectContent>
                  </Select>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchOrders()}
                    className="h-9 px-2.5"
                    title="Atualizar lista"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Grid de Cards de Ordens */}
              {ordersLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {[1, 2, 3].map((i) => (
                    <Card key={i} className="animate-pulse h-64 bg-muted/40 rounded-2xl" />
                  ))}
                </div>
              ) : filteredOrders.length === 0 ? (
                <Card className="rounded-2xl border-dashed border-2 py-12 text-center">
                  <CardContent className="space-y-4">
                    <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-600 mx-auto flex items-center justify-center">
                      <Wrench className="w-7 h-7" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-semibold text-lg">Nenhuma ordem de serviço encontrada</h3>
                      <p className="text-sm text-muted-foreground max-w-md mx-auto">
                        {listSearch || listStatusFilter !== "all"
                          ? "Nenhum resultado corresponde aos filtros aplicados. Tente limpar a busca."
                          : "Crie a primeira ordem de serviço para gerar o link exclusivo do prestador."}
                      </p>
                    </div>
                    <Button
                      onClick={() => {
                        resetFormToCreate();
                        setActiveTab("form");
                      }}
                      className="gap-2 font-medium"
                    >
                      <Plus className="w-4 h-4" />
                      Criar Primeira Ordem de Serviço
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {filteredOrders.map((order) => {
                    const totalFlats = order.flats?.length || 0;
                    const doneFlats = (order.flats || []).filter((f) => f.status === "done").length;
                    const inProgressFlats = (order.flats || []).filter((f) => f.status === "in_progress").length;
                    const pendingFlats = (order.flats || []).filter((f) => f.status === "pending").length;
                    const percent = totalFlats > 0 ? Math.round((doneFlats / totalFlats) * 100) : 0;
                    const origin = typeof window !== "undefined" ? window.location.origin : "";
                    const portalUrl = `${origin}/servico/${order.token}`;

                    return (
                      <Card
                        key={order.id}
                        className="rounded-2xl border bg-card shadow-xs hover:shadow-md transition-all flex flex-col justify-between overflow-hidden"
                      >
                        <CardHeader className="pb-3 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1 flex-1 min-w-0">
                              <Badge
                                variant={
                                  order.status === "active"
                                    ? "default"
                                    : order.status === "closed"
                                    ? "secondary"
                                    : "outline"
                                }
                                className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                                  order.status === "active"
                                    ? "bg-emerald-600 hover:bg-emerald-600 text-white"
                                    : order.status === "closed"
                                    ? "bg-slate-600 text-white"
                                    : ""
                                }`}
                              >
                                {order.status === "active"
                                  ? "● Ativo"
                                  : order.status === "closed"
                                  ? "Encerrado"
                                  : "Rascunho"}
                              </Badge>
                              <CardTitle className="text-base font-bold text-foreground leading-snug line-clamp-2 pt-1">
                                {order.title}
                              </CardTitle>
                            </div>
                            <span className="text-[11px] text-muted-foreground whitespace-nowrap pt-1">
                              {formatDateTime(order.createdAt).split(" ")[0]}
                            </span>
                          </div>

                          {/* Chips de Regras */}
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            <Badge variant="outline" className="text-[10px] font-normal py-0.5 px-2 bg-muted/40">
                              {order.cleanFlatMode === "never" && "🚫 Bloqueia Limpo"}
                              {order.cleanFlatMode === "priority" && "⚠️ Sujos Primeiro"}
                              {order.cleanFlatMode === "always" && "✅ Todos Liberados"}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] font-normal py-0.5 px-2 bg-muted/40">
                              ⚡ Máx {order.maxSimultaneousFlats} simult.
                            </Badge>
                            <Badge variant="outline" className="text-[10px] font-normal py-0.5 px-2 bg-muted/40">
                              📅 Máx {order.maxFlatsPerDay}/dia
                            </Badge>
                            {order.requirePhotos && (
                              <Badge variant="outline" className="text-[10px] font-normal py-0.5 px-2 bg-muted/40">
                                📷 Fotos obrigat.
                              </Badge>
                            )}
                          </div>
                        </CardHeader>

                        <CardContent className="space-y-4 pb-4">
                          {/* Barra de Progresso */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                              <span>Progresso dos Quartos</span>
                              <span>
                                {doneFlats} de {totalFlats} ({percent}%)
                              </span>
                            </div>
                            <Progress value={percent} className="h-2 rounded-full" />
                            <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                ✓ {doneFlats} concluído{doneFlats !== 1 ? "s" : ""}
                              </span>
                              <span className="text-sky-600 dark:text-sky-400 font-medium">
                                ⏳ {inProgressFlats} em andamento
                              </span>
                              <span>{pendingFlats} pendente{pendingFlats !== 1 ? "s" : ""}</span>
                            </div>
                          </div>

                          {/* Link do Portal do Prestador */}
                          <div className="space-y-1.5 p-2.5 rounded-xl bg-muted/50 border text-xs">
                            <span className="font-semibold text-foreground block">
                              Link de Acesso do Prestador:
                            </span>
                            <div className="flex items-center gap-1.5">
                              <code className="flex-1 bg-background px-2 py-1 rounded border text-[11px] font-mono text-muted-foreground truncate select-all">
                                {portalUrl}
                              </code>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => copyPortalLink(order.token)}
                                    className="h-7 px-2 shrink-0"
                                  >
                                    <Copy className="w-3.5 h-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Copiar link do portal</TooltipContent>
                              </Tooltip>

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    asChild
                                    className="h-7 px-2 shrink-0"
                                  >
                                    <a href={portalUrl} target="_blank" rel="noopener noreferrer">
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Abrir portal em nova aba</TooltipContent>
                              </Tooltip>
                            </div>
                          </div>
                        </CardContent>

                        {/* Botões de Ação do Card */}
                        <CardFooter className="pt-2 pb-3 px-4 bg-muted/20 border-t flex items-center justify-between gap-2">
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => {
                              setSelectedTrackingOrderId(order.id);
                              setActiveTab("tracking");
                            }}
                            className="flex-1 h-8 text-xs font-semibold gap-1.5"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Ver Progresso</span>
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => loadOrderIntoForm(order)}
                            className="h-8 px-2.5 text-xs gap-1"
                            title="Editar ordem de serviço"
                          >
                            <Edit className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Editar</span>
                          </Button>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  toggleStatusMutation.mutate({
                                    orderId: order.id,
                                    nextStatus: order.status === "closed" ? "active" : "closed",
                                  })
                                }
                                disabled={toggleStatusMutation.isPending}
                                className={`h-8 px-2 text-xs ${
                                  order.status === "closed"
                                    ? "text-emerald-600 hover:text-emerald-700"
                                    : "text-amber-600 hover:text-amber-700"
                                }`}
                              >
                                <Power className="w-3.5 h-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {order.status === "closed" ? "Reativar Serviço" : "Encerrar Serviço"}
                            </TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setDeleteConfirmOrderId(order.id)}
                                className="h-8 px-2 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Excluir Ordem</TooltipContent>
                          </Tooltip>
                        </CardFooter>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* ════════════════════════════════════════════════════════════════
                ABA 2: CRIAR / EDITAR ORDEM DE SERVIÇO
               ════════════════════════════════════════════════════════════════ */}
            <TabsContent value="form" className="space-y-6 focus-visible:outline-none">
              <Card className="rounded-2xl border shadow-xs">
                <CardHeader className="border-b pb-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setActiveTab("list")}
                          className="h-8 px-2 -ml-2 text-muted-foreground hover:text-foreground gap-1"
                        >
                          <ArrowLeft className="w-4 h-4" />
                          <span>Voltar</span>
                        </Button>
                        <CardTitle className="text-xl font-bold">
                          {editingOrderId ? "Editar Ordem de Serviço" : "Nova Ordem de Serviço"}
                        </CardTitle>
                      </div>
                      <CardDescription>
                        Configure os flats, regras de limpeza e orientações para o prestador externo.
                      </CardDescription>
                    </div>

                    {editingOrderId && (
                      <Badge variant="outline" className="text-xs font-mono">
                        ID: {editingOrderId}
                      </Badge>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-6 pt-6">
                  {/* 1. Título do Serviço */}
                  <div className="space-y-2">
                    <Label htmlFor="service-title" className="text-sm font-semibold flex items-center gap-1.5">
                      Título do Serviço / Manutenção <span className="text-rose-500">*</span>
                    </Label>
                    <Input
                      id="service-title"
                      placeholder="Ex: Pintura Geral e Reparos de Tomadas — Bloco A"
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      className="text-base py-5 rounded-xl font-medium"
                    />
                    <p className="text-xs text-muted-foreground">
                      Este nome será exibido ao prestador no portal e no card das camareiras.
                    </p>
                  </div>

                  {/* 2. Modo de Liberação de Flat Limpo (R3/R4) */}
                  <div className="space-y-3">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-semibold flex items-center gap-1.5">
                        Regra de Liberação de Flats Limpos <span className="text-rose-500">*</span>
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Define como o sistema lida com quartos que já estão limpos para evitar retrabalho de faxina.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {/* Opção 1: never */}
                      <div
                        onClick={() => setFormCleanFlatMode("never")}
                        className={`cursor-pointer p-4 rounded-xl border-2 transition-all flex flex-col justify-between gap-3 ${
                          formCleanFlatMode === "never"
                            ? "border-rose-600 bg-rose-500/10 shadow-xs"
                            : "border-border/60 hover:border-border hover:bg-muted/30"
                        }`}
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-sm text-foreground flex items-center gap-1.5">
                              🚫 Bloquear se estiver limpo
                            </span>
                            <div
                              className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                formCleanFlatMode === "never"
                                  ? "border-rose-600 bg-rose-600 text-white"
                                  : "border-muted-foreground/40"
                              }`}
                            >
                              {formCleanFlatMode === "never" && <Check className="w-2.5 h-2.5" />}
                            </div>
                          </div>
                          <Badge variant="outline" className="text-[10px] text-rose-700 dark:text-rose-300 border-rose-300">
                            never
                          </Badge>
                          <p className="text-xs text-muted-foreground leading-relaxed pt-1">
                            Bloquear se o flat estiver limpo (não tem pós-checkout nem dirty). O prestador só
                            pode iniciar flats que já estejam sujos.
                          </p>
                        </div>
                      </div>

                      {/* Opção 2: priority */}
                      <div
                        onClick={() => setFormCleanFlatMode("priority")}
                        className={`cursor-pointer p-4 rounded-xl border-2 transition-all flex flex-col justify-between gap-3 ${
                          formCleanFlatMode === "priority"
                            ? "border-amber-600 bg-amber-500/10 shadow-xs"
                            : "border-border/60 hover:border-border hover:bg-muted/30"
                        }`}
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-sm text-foreground flex items-center gap-1.5">
                              ⚠️ Prioridade para flats sujos
                            </span>
                            <div
                              className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                formCleanFlatMode === "priority"
                                  ? "border-amber-600 bg-amber-600 text-white"
                                  : "border-muted-foreground/40"
                              }`}
                            >
                              {formCleanFlatMode === "priority" && <Check className="w-2.5 h-2.5" />}
                            </div>
                          </div>
                          <Badge variant="outline" className="text-[10px] text-amber-700 dark:text-amber-300 border-amber-300">
                            priority (Recomendado)
                          </Badge>
                          <p className="text-xs text-muted-foreground leading-relaxed pt-1">
                            Só liberar flat limpo se nenhum outro flat do serviço estiver sujo. Força o
                            prestador a realizar primeiro os quartos que já estão aguardando faxina.
                          </p>
                        </div>
                      </div>

                      {/* Opção 3: always */}
                      <div
                        onClick={() => setFormCleanFlatMode("always")}
                        className={`cursor-pointer p-4 rounded-xl border-2 transition-all flex flex-col justify-between gap-3 ${
                          formCleanFlatMode === "always"
                            ? "border-emerald-600 bg-emerald-500/10 shadow-xs"
                            : "border-border/60 hover:border-border hover:bg-muted/30"
                        }`}
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-sm text-foreground flex items-center gap-1.5">
                              ✅ Liberar qualquer flat
                            </span>
                            <div
                              className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                formCleanFlatMode === "always"
                                  ? "border-emerald-600 bg-emerald-600 text-white"
                                  : "border-muted-foreground/40"
                              }`}
                            >
                              {formCleanFlatMode === "always" && <Check className="w-2.5 h-2.5" />}
                            </div>
                          </div>
                          <Badge variant="outline" className="text-[10px] text-emerald-700 dark:text-emerald-300 border-emerald-300">
                            always
                          </Badge>
                          <p className="text-xs text-muted-foreground leading-relaxed pt-1">
                            Liberar qualquer flat a qualquer momento (com sugestão de prioridade visual para os
                            quartos sujos no portal).
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 3. Limites Operacionais e Previsão de Duração */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-muted/40 border">
                    <div className="space-y-1.5">
                      <Label htmlFor="max-simultaneous" className="text-xs font-semibold">
                        Máx. Flats Simultâneos <span className="text-rose-500">*</span>
                      </Label>
                      <Input
                        id="max-simultaneous"
                        type="number"
                        min={1}
                        max={19}
                        value={formMaxSimultaneous}
                        onChange={(e) => setFormMaxSimultaneous(parseInt(e.target.value, 10) || 1)}
                        className="h-10 text-sm font-semibold"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Quantos flats o prestador pode iniciar ao mesmo tempo.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="max-daily" className="text-xs font-semibold">
                        Máx. Flats Concluídos por Dia <span className="text-rose-500">*</span>
                      </Label>
                      <Input
                        id="max-daily"
                        type="number"
                        min={1}
                        max={19}
                        value={formMaxPerDay}
                        onChange={(e) => setFormMaxPerDay(parseInt(e.target.value, 10) || 1)}
                        className="h-10 text-sm font-semibold"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Teto de quartos finalizados por dia nesta ordem.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="est-duration" className="text-xs font-semibold">
                        Duração Estimada por Flat (horas)
                      </Label>
                      <Input
                        id="est-duration"
                        type="number"
                        step={0.5}
                        min={0.5}
                        max={72}
                        placeholder="Ex: 3"
                        value={formEstimatedDurationHours}
                        onChange={(e) =>
                          setFormEstimatedDurationHours(
                            e.target.value === "" ? "" : parseFloat(e.target.value) || 0
                          )
                        }
                        className="h-10 text-sm font-semibold"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Usado para calcular bloqueio visual no calendário PMS.
                      </p>
                    </div>
                  </div>

                  {/* 4. Toggles de Exigência de Fotos e Formato de Instruções */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl border">
                    {/* Toggle Exigir Fotos */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <Label htmlFor="toggle-photos" className="text-sm font-semibold flex items-center gap-1.5">
                          <Camera className="w-4 h-4 text-primary" />
                          Exigir fotos no término do serviço
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          O prestador não poderá finalizar o flat sem anexar pelo menos 1 foto.
                        </p>
                      </div>
                      <Switch
                        id="toggle-photos"
                        checked={formRequirePhotos}
                        onCheckedChange={setFormRequirePhotos}
                      />
                    </div>

                    {/* Toggle Formato de Instruções */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-semibold flex items-center gap-1.5">
                          {formInstructionFormat === "text" ? (
                            <FileText className="w-4 h-4 text-primary" />
                          ) : (
                            <List className="w-4 h-4 text-primary" />
                          )}
                          Formato das Instruções
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          {formInstructionFormat === "text"
                            ? "Texto corrido (parágrafos e detalhes)"
                            : "Lista de itens / checklist"}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 bg-muted p-1 rounded-lg">
                        <Button
                          type="button"
                          variant={formInstructionFormat === "text" ? "secondary" : "ghost"}
                          size="sm"
                          onClick={() => setFormInstructionFormat("text")}
                          className="h-7 text-xs px-2.5 font-medium"
                        >
                          Texto
                        </Button>
                        <Button
                          type="button"
                          variant={formInstructionFormat === "list" ? "secondary" : "ghost"}
                          size="sm"
                          onClick={() => setFormInstructionFormat("list")}
                          className="h-7 text-xs px-2.5 font-medium"
                        >
                          Lista
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* 5. Instruções Gerais "Aplicar a Todos" */}
                  <div className="space-y-2">
                    <Label htmlFor="general-instructions" className="text-sm font-semibold flex items-center gap-1.5">
                      Instruções Gerais (aplicar a todos os flats selecionados)
                    </Label>
                    <Textarea
                      id="general-instructions"
                      rows={3}
                      placeholder={
                        formInstructionFormat === "text"
                          ? "Descreva as tarefas gerais: Ex: Lixar paredes, cobrir furos, aplicar duas demãos de tinta Suvinil Branco Neve, proteger rodapés e tomadas."
                          : "1. Retirar capas de tomadas\n2. Lixar e emassar paredes danificadas\n3. Pintar paredes e teto\n4. Recolocar espelhos e limpar chão"
                      }
                      value={formDefaultInstructions}
                      onChange={(e) => setFormDefaultInstructions(e.target.value)}
                      className="font-mono text-xs rounded-xl"
                    />
                    <p className="text-xs text-muted-foreground">
                      Estas orientações serão exibidas em todos os flats desta ordem que não possuírem instrução individual.
                    </p>
                  </div>

                  {/* 6. Seleção de Flats (Grid de 19 flats) */}
                  <div className="space-y-3 pt-2">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b pb-2">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-semibold flex items-center gap-1.5">
                          <Building className="w-4 h-4 text-primary" />
                          Selecione os Apartamentos Participantes <span className="text-rose-500">*</span>
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          {formSelectedFlatIds.length} flat{formSelectedFlatIds.length !== 1 ? "s" : ""} selecionado
                          {formSelectedFlatIds.length !== 1 ? "s" : ""} de {activeFlats.length} ativos.
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setFormSelectedFlatIds(activeFlats.map((f: any) => f.id))}
                          className="h-7 text-xs"
                        >
                          Selecionar Todos ({activeFlats.length})
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setFormSelectedFlatIds([])}
                          className="h-7 text-xs text-muted-foreground"
                        >
                          Desmarcar Todos
                        </Button>
                      </div>
                    </div>

                    {flatsLoading ? (
                      <div className="h-32 flex items-center justify-center">
                        <span className="text-xs text-muted-foreground animate-pulse">
                          Carregando apartamentos...
                        </span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7 gap-2.5">
                        {activeFlats.map((flat: any) => {
                          const isSelected = formSelectedFlatIds.includes(flat.id);
                          return (
                            <div
                              key={flat.id}
                              onClick={() => {
                                setFormSelectedFlatIds((prev) =>
                                  prev.includes(flat.id)
                                    ? prev.filter((id) => id !== flat.id)
                                    : [...prev, flat.id]
                                );
                              }}
                              className={`cursor-pointer select-none p-3 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1.5 ${
                                isSelected
                                  ? "border-primary bg-primary/10 shadow-xs font-semibold text-primary"
                                  : "border-border/60 hover:bg-muted/40 text-muted-foreground"
                              }`}
                            >
                              <div className="flex items-center justify-between w-full">
                                <span className="text-base font-bold text-foreground">
                                  {flat.number}
                                </span>
                                <div
                                  className={`w-4 h-4 rounded border flex items-center justify-center ${
                                    isSelected
                                      ? "bg-primary border-primary text-primary-foreground"
                                      : "border-muted-foreground/40 bg-background"
                                  }`}
                                >
                                  {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                                </div>
                              </div>
                              <span className="text-[10px] text-muted-foreground truncate w-full">
                                {flat.isOccupied ? "🔴 Ocupado" : "🟢 Vago / Limpo"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* 7. Opção de Instruções Individuais por Flat */}
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl border bg-muted/20">
                      <div className="space-y-0.5">
                        <Label htmlFor="custom-instructions-toggle" className="text-sm font-semibold cursor-pointer">
                          Personalizar instruções individuais por flat
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Permite especificar reparos pontuais exclusivos para cada apartamento selecionado.
                        </p>
                      </div>
                      <Switch
                        id="custom-instructions-toggle"
                        checked={formHasCustomInstructions}
                        onCheckedChange={setFormHasCustomInstructions}
                      />
                    </div>

                    {formHasCustomInstructions && (
                      <div className="space-y-3 pl-2 sm:pl-4 border-l-2 border-primary/40 pt-2">
                        <p className="text-xs text-muted-foreground font-medium">
                          Preencha as observações exclusivas para cada flat selecionado. Deixe em branco para
                          utilizar a instrução geral padrão:
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {formSelectedFlatIds.map((flatId) => {
                            const flatObj = activeFlats.find((f: any) => f.id === flatId);
                            const labelText = `Flat ${flatObj?.number || flatId}`;
                            return (
                              <div key={flatId} className="space-y-1.5 p-3 rounded-xl border bg-card">
                                <Label className="text-xs font-bold flex items-center gap-1.5 text-foreground">
                                  <Building className="w-3.5 h-3.5 text-primary" />
                                  Instrução específica — {labelText}
                                </Label>
                                <Textarea
                                  rows={2}
                                  placeholder={`Ex: Atenção ao rodapé do banheiro e pintura atrás da TV no ${labelText}...`}
                                  value={formFlatCustomInstructions[flatId] || ""}
                                  onChange={(e) =>
                                    setFormFlatCustomInstructions((prev) => ({
                                      ...prev,
                                      [flatId]: e.target.value,
                                    }))
                                  }
                                  className="text-xs font-mono rounded-lg"
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>

                {/* Botões do Rodapé do Formulário */}
                <CardFooter className="border-t pt-4 pb-5 px-6 flex items-center justify-between gap-3 bg-muted/20">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setActiveTab("list")}
                    disabled={saveMutation.isPending}
                    className="font-medium"
                  >
                    Cancelar
                  </Button>

                  <Button
                    type="button"
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                    className="gap-2 font-semibold px-6 shadow-xs"
                  >
                    {saveMutation.isPending ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Salvando Ordem...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{editingOrderId ? "Salvar Alterações" : "Criar Ordem de Serviço"}</span>
                      </>
                    )}
                  </Button>
                </CardFooter>
              </Card>
            </TabsContent>

            {/* ════════════════════════════════════════════════════════════════
                ABA 3: PAINEL DE ACOMPANHAMENTO EM TEMPO REAL
               ════════════════════════════════════════════════════════════════ */}
            <TabsContent value="tracking" className="space-y-6 focus-visible:outline-none">
              {/* Barra Superior de Seleção e Polling */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card p-4 rounded-2xl border shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
                  <div className="space-y-0.5 shrink-0">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
                      Ordem Selecionada
                    </span>
                    <Select
                      value={effectiveTrackingOrderId}
                      onValueChange={(val) => setSelectedTrackingOrderId(val)}
                    >
                      <SelectTrigger className="w-full sm:w-80 h-10 font-semibold text-sm">
                        <SelectValue placeholder="Selecione a Ordem..." />
                      </SelectTrigger>
                      <SelectContent>
                        {orders.map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.title} ({o.status === "active" ? "Ativo" : "Encerrado"})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {progressData?.token && (
                    <div className="flex items-center gap-1.5 self-end sm:self-center pt-2 sm:pt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyPortalLink(progressData.token)}
                        className="h-8 text-xs gap-1.5 font-medium"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copiar Link do Portal</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        asChild
                        className="h-8 px-2"
                        title="Abrir portal do prestador"
                      >
                        <a
                          href={`${typeof window !== "undefined" ? window.location.origin : ""}/servico/${
                            progressData.token
                          }`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </Button>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 px-3 py-1.5 rounded-lg">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="font-medium">Atualizando a cada 10s</span>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchProgress()}
                    disabled={progressFetching}
                    className="h-9 gap-1.5 text-xs font-semibold"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${progressFetching ? "animate-spin" : ""}`} />
                    <span>Atualizar</span>
                  </Button>
                </div>
              </div>

              {/* Informações Resumidas e KPIs da Ordem */}
              {progressLoading ? (
                <div className="h-40 flex items-center justify-center">
                  <span className="text-xs text-muted-foreground animate-pulse">
                    Carregando dados de progresso...
                  </span>
                </div>
              ) : !progressData ? (
                <Card className="rounded-2xl py-12 text-center">
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Selecione uma ordem de serviço acima para visualizar o acompanhamento detalhado.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-5">
                  {/* Cards de Métricas (KPIs) */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3.5">
                    {/* Total */}
                    <Card className="rounded-xl border p-4 space-y-1">
                      <span className="text-xs text-muted-foreground font-semibold">Total de Flats</span>
                      <div className="text-2xl font-bold">{progressData.stats.total}</div>
                      <Progress value={progressData.stats.percentage} className="h-1.5 mt-2" />
                    </Card>

                    {/* Pendentes */}
                    <Card className="rounded-xl border p-4 space-y-1">
                      <span className="text-xs text-muted-foreground font-semibold">Pendentes</span>
                      <div className="text-2xl font-bold text-slate-700 dark:text-slate-300">
                        {progressData.stats.pending}
                      </div>
                      <span className="text-[11px] text-muted-foreground">Aguardando início</span>
                    </Card>

                    {/* Em Andamento */}
                    <Card className="rounded-xl border p-4 space-y-1 bg-sky-500/5 border-sky-500/30">
                      <span className="text-xs text-sky-700 dark:text-sky-300 font-semibold flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
                        Em Andamento
                      </span>
                      <div className="text-2xl font-bold text-sky-700 dark:text-sky-300">
                        {progressData.stats.inProgress}
                      </div>
                      <span className="text-[11px] text-sky-600 dark:text-sky-400">Prestador no local</span>
                    </Card>

                    {/* Finalizados */}
                    <Card className="rounded-xl border p-4 space-y-1 bg-emerald-500/5 border-emerald-500/30">
                      <span className="text-xs text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5" />
                        Finalizados
                      </span>
                      <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                        {progressData.stats.done}
                      </div>
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
                        {progressData.stats.percentage}% concluído
                      </span>
                    </Card>

                    {/* Prestador Identificado */}
                    <Card className="rounded-xl border p-4 space-y-1 col-span-2 sm:col-span-4 lg:col-span-1 bg-muted/40">
                      <span className="text-xs text-muted-foreground font-semibold flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-primary" />
                        Prestador Responsável
                      </span>
                      <div className="text-sm font-bold truncate">
                        {progressData.worker?.mainWorker?.name || "Ainda não identificado"}
                      </div>
                      <span className="text-[11px] text-muted-foreground truncate block">
                        {progressData.worker?.mainWorker?.cpf
                          ? `CPF: ${formatCpf(progressData.worker.mainWorker.cpf)}`
                          : "Aguardando cadastro no link"}
                      </span>
                    </Card>
                  </div>

                  {/* Filtro por Status da Tabela */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-1.5 bg-muted p-1 rounded-xl">
                      <Button
                        variant={trackingStatusFilter === "all" ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setTrackingStatusFilter("all")}
                        className="h-8 text-xs font-semibold px-3 rounded-lg"
                      >
                        Todos ({progressData.flats.length})
                      </Button>
                      <Button
                        variant={trackingStatusFilter === "pending" ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setTrackingStatusFilter("pending")}
                        className="h-8 text-xs font-semibold px-3 rounded-lg"
                      >
                        Pendentes ({progressData.stats.pending})
                      </Button>
                      <Button
                        variant={trackingStatusFilter === "in_progress" ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setTrackingStatusFilter("in_progress")}
                        className="h-8 text-xs font-semibold px-3 rounded-lg text-sky-700 dark:text-sky-300"
                      >
                        Em Andamento ({progressData.stats.inProgress})
                      </Button>
                      <Button
                        variant={trackingStatusFilter === "done" ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setTrackingStatusFilter("done")}
                        className="h-8 text-xs font-semibold px-3 rounded-lg text-emerald-700 dark:text-emerald-300"
                      >
                        Finalizados ({progressData.stats.done})
                      </Button>
                    </div>

                    <span className="text-xs text-muted-foreground">
                      Clique em qualquer linha para ver fotos e observações completas.
                    </span>
                  </div>

                  {/* Tabela de Acompanhamento */}
                  <div className="rounded-2xl border bg-card overflow-hidden shadow-xs">
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="w-24 font-bold text-xs">Flat</TableHead>
                          <TableHead className="w-36 font-bold text-xs">Status</TableHead>
                          <TableHead className="font-bold text-xs">Prestador</TableHead>
                          <TableHead className="font-bold text-xs">Início</TableHead>
                          <TableHead className="font-bold text-xs">Fim / Duração</TableHead>
                          <TableHead className="w-36 font-bold text-xs">Precisa Camareira?</TableHead>
                          <TableHead className="font-bold text-xs">Observações</TableHead>
                          <TableHead className="w-24 font-bold text-xs text-center">Fotos</TableHead>
                          <TableHead className="w-28 font-bold text-xs text-right">Ação</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {trackingFlats.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={9} className="text-center py-8 text-muted-foreground text-sm">
                              Nenhum apartamento encontrado com o filtro selecionado.
                            </TableCell>
                          </TableRow>
                        ) : (
                          trackingFlats.map((flat) => {
                            const hasPhotos = Array.isArray(flat.photos) && flat.photos.length > 0;
                            const durationStr = formatDuration(flat.startedAt, flat.finishedAt);

                            return (
                              <TableRow
                                key={flat.flatId}
                                onClick={() => setDetailModalFlat(flat)}
                                className="cursor-pointer hover:bg-muted/50 transition-colors"
                              >
                                {/* Flat */}
                                <TableCell className="font-bold text-sm text-foreground">
                                  Flat {flat.flatNumber}
                                </TableCell>

                                {/* Status */}
                                <TableCell>
                                  {flat.status === "pending" && (
                                    <Badge variant="secondary" className="text-[11px] font-semibold">
                                      Pendente
                                    </Badge>
                                  )}
                                  {flat.status === "in_progress" && (
                                    <Badge className="bg-sky-600 hover:bg-sky-600 text-white text-[11px] font-semibold gap-1.5 animate-pulse">
                                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                                      Em Andamento
                                    </Badge>
                                  )}
                                  {flat.status === "done" && (
                                    <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-[11px] font-semibold gap-1">
                                      <Check className="w-3 h-3 stroke-[3]" />
                                      Finalizado
                                    </Badge>
                                  )}
                                </TableCell>

                                {/* Prestador */}
                                <TableCell className="text-xs">
                                  {flat.workerName ? (
                                    <div className="space-y-0.5">
                                      <span className="font-semibold text-foreground block truncate max-w-[130px]">
                                        {flat.workerName}
                                      </span>
                                      {flat.workerCpf && (
                                        <span className="text-[10px] text-muted-foreground font-mono block">
                                          {formatCpf(flat.workerCpf)}
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </TableCell>

                                {/* Início */}
                                <TableCell className="text-xs whitespace-nowrap">
                                  {formatDateTime(flat.startedAt)}
                                </TableCell>

                                {/* Fim / Duração */}
                                <TableCell className="text-xs whitespace-nowrap">
                                  {flat.finishedAt ? (
                                    <div className="space-y-0.5">
                                      <span>{formatDateTime(flat.finishedAt)}</span>
                                      {durationStr && (
                                        <span className="text-[10px] text-muted-foreground block font-medium">
                                          ⏱️ {durationStr}
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </TableCell>

                                {/* Precisa Camareira */}
                                <TableCell>
                                  {flat.needsCleaning === true && (
                                    <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 text-[10px] font-bold">
                                      🧹 Sim, chamar faxina
                                    </Badge>
                                  )}
                                  {flat.needsCleaning === false && (
                                    <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 text-[10px] font-bold">
                                      ✓ Mantido limpo
                                    </Badge>
                                  )}
                                  {flat.needsCleaning === null || flat.needsCleaning === undefined ? (
                                    <span className="text-muted-foreground text-xs">-</span>
                                  ) : null}
                                </TableCell>

                                {/* Observações */}
                                <TableCell className="text-xs max-w-xs truncate text-muted-foreground">
                                  {flat.observations ? (
                                    <span className="text-foreground italic">
                                      "{flat.observations}"
                                    </span>
                                  ) : (
                                    "-"
                                  )}
                                </TableCell>

                                {/* Fotos */}
                                <TableCell className="text-center">
                                  {hasPhotos ? (
                                    <Badge
                                      variant="outline"
                                      className="text-xs font-semibold gap-1 bg-primary/10 border-primary/30 text-primary cursor-pointer hover:bg-primary/20"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDetailModalFlat(flat);
                                      }}
                                    >
                                      <Camera className="w-3.5 h-3.5" />
                                      {flat.photos!.length}
                                    </Badge>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">-</span>
                                  )}
                                </TableCell>

                                {/* Ações: Resetar */}
                                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setResetConfirmFlat(flat)}
                                        disabled={flat.status === "pending"}
                                        className="h-8 px-2 text-xs text-muted-foreground hover:text-amber-600 gap-1"
                                      >
                                        <RotateCcw className="w-3.5 h-3.5" />
                                        <span className="hidden sm:inline">Resetar</span>
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      Reabrir flat para o status Pendente
                                    </TooltipContent>
                                  </Tooltip>
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>

          {/* ════════════════════════════════════════════════════════════════
              MODAL DE DETALHES DO FLAT (CLICK NA LINHA DA TABELA)
             ════════════════════════════════════════════════════════════════ */}
          <Dialog open={Boolean(detailModalFlat)} onOpenChange={(open) => !open && setDetailModalFlat(null)}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl">
              <DialogHeader className="border-b pb-3">
                <div className="flex items-center justify-between gap-3">
                  <DialogTitle className="text-xl font-bold flex items-center gap-2">
                    <Building className="w-5 h-5 text-primary" />
                    <span>Acompanhamento — Flat {detailModalFlat?.flatNumber}</span>
                  </DialogTitle>
                  {detailModalFlat && (
                    <Badge
                      className={`text-xs font-semibold ${
                        detailModalFlat.status === "done"
                          ? "bg-emerald-600 text-white"
                          : detailModalFlat.status === "in_progress"
                          ? "bg-sky-600 text-white animate-pulse"
                          : "bg-slate-500 text-white"
                      }`}
                    >
                      {detailModalFlat.status === "done"
                        ? "Concluído"
                        : detailModalFlat.status === "in_progress"
                        ? "Em Andamento"
                        : "Pendente"}
                    </Badge>
                  )}
                </div>
                <DialogDescription>
                  Registro completo de execução, prestador, horários e evidências fotográficas.
                </DialogDescription>
              </DialogHeader>

              {detailModalFlat && (
                <div className="space-y-4 py-2 text-sm">
                  {/* Grid de Informações Básicas */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-muted/40 border">
                    <div>
                      <span className="text-[11px] text-muted-foreground font-semibold block">Prestador</span>
                      <span className="font-bold text-foreground">
                        {detailModalFlat.workerName || "Não iniciado"}
                      </span>
                      {detailModalFlat.workerCpf && (
                        <span className="text-[10px] text-muted-foreground font-mono block">
                          CPF: {formatCpf(detailModalFlat.workerCpf)}
                        </span>
                      )}
                    </div>

                    <div>
                      <span className="text-[11px] text-muted-foreground font-semibold block">Início do Serviço</span>
                      <span className="font-semibold text-foreground">
                        {formatDateTime(detailModalFlat.startedAt)}
                      </span>
                    </div>

                    <div>
                      <span className="text-[11px] text-muted-foreground font-semibold block">Finalização</span>
                      <span className="font-semibold text-foreground">
                        {formatDateTime(detailModalFlat.finishedAt)}
                      </span>
                      {detailModalFlat.startedAt && detailModalFlat.finishedAt && (
                        <span className="text-[10px] text-muted-foreground block font-medium">
                          Duração: {formatDuration(detailModalFlat.startedAt, detailModalFlat.finishedAt)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Informação sobre Necessidade de Camareira */}
                  {detailModalFlat.needsCleaning !== undefined && detailModalFlat.needsCleaning !== null && (
                    <div
                      className={`p-3 rounded-xl border flex items-center gap-3 ${
                        detailModalFlat.needsCleaning
                          ? "bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200"
                          : "bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-200"
                      }`}
                    >
                      <div className="w-8 h-8 rounded-lg bg-background flex items-center justify-center shrink-0 shadow-2xs">
                        {detailModalFlat.needsCleaning ? (
                          <AlertTriangle className="w-4 h-4 text-amber-600" />
                        ) : (
                          <ShieldCheck className="w-4 h-4 text-emerald-600" />
                        )}
                      </div>
                      <div className="space-y-0.5 text-xs">
                        <span className="font-bold block">
                          {detailModalFlat.needsCleaning
                            ? "Camareira Requisitada pelo Prestador"
                            : "Quarto Permaneceu Limpo"}
                        </span>
                        <p className="text-muted-foreground leading-normal">
                          {detailModalFlat.needsCleaning
                            ? "O prestador indicou que o quarto precisa de revisão/limpeza pela governança antes de nova entrada."
                            : "O prestador informou que manteve o apartamento limpo e intacto durante os reparos."}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Instruções do Flat */}
                  {detailModalFlat.instructions && (
                    <div className="space-y-1.5 p-3 rounded-xl bg-card border">
                      <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-primary" />
                        Instruções Fornecidas para Este Flat:
                      </span>
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap font-mono bg-muted/40 p-2.5 rounded-lg border">
                        {detailModalFlat.instructions}
                      </p>
                    </div>
                  )}

                  {/* Observações do Prestador */}
                  <div className="space-y-1.5 p-3 rounded-xl bg-card border">
                    <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Edit className="w-3.5 h-3.5 text-primary" />
                      Observações do Prestador:
                    </span>
                    <p className="text-xs text-muted-foreground italic bg-muted/40 p-2.5 rounded-lg border">
                      {detailModalFlat.observations || "Nenhuma observação registrada."}
                    </p>
                  </div>

                  {/* Galeria de Fotos */}
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5 text-primary" />
                      Fotos do Serviço ({detailModalFlat.photos?.length || 0})
                    </span>

                    {Array.isArray(detailModalFlat.photos) && detailModalFlat.photos.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                        {detailModalFlat.photos.map((photoUrl, idx) => (
                          <div
                            key={idx}
                            onClick={() => setZoomPhotoUrl(photoUrl)}
                            className="group relative cursor-pointer aspect-video rounded-xl overflow-hidden border bg-muted"
                          >
                            <img
                              src={photoUrl}
                              alt={`Foto ${idx + 1} do Flat ${detailModalFlat.flatNumber}`}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-semibold gap-1">
                              <Eye className="w-4 h-4" />
                              <span>Ampliar</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 rounded-xl border border-dashed text-center text-xs text-muted-foreground">
                        Nenhuma foto anexada para este flat.
                      </div>
                    )}
                  </div>
                </div>
              )}

              <DialogFooter className="border-t pt-3 flex items-center justify-between gap-2">
                {detailModalFlat && detailModalFlat.status !== "pending" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setResetConfirmFlat(detailModalFlat);
                    }}
                    className="text-xs gap-1.5 text-amber-600 hover:text-amber-700"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Resetar Flat para Pendente
                  </Button>
                )}

                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setDetailModalFlat(null)}
                  className="font-medium ml-auto"
                >
                  Fechar Detalhes
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* ════════════════════════════════════════════════════════════════
              MODAL DE ZOOM DA FOTO
             ════════════════════════════════════════════════════════════════ */}
          <Dialog open={Boolean(zoomPhotoUrl)} onOpenChange={(open) => !open && setZoomPhotoUrl(null)}>
            <DialogContent className="max-w-4xl p-2 bg-black/90 border-0 rounded-2xl">
              <div className="relative flex items-center justify-center p-2">
                {zoomPhotoUrl && (
                  <img
                    src={zoomPhotoUrl}
                    alt="Evidência fotográfica do serviço ampliada"
                    className="max-h-[80vh] w-auto rounded-lg object-contain"
                  />
                )}
              </div>
            </DialogContent>
          </Dialog>

          {/* ════════════════════════════════════════════════════════════════
              MODAL DE CONFIRMAÇÃO DE RESET DO FLAT
             ════════════════════════════════════════════════════════════════ */}
          <Dialog open={Boolean(resetConfirmFlat)} onOpenChange={(open) => !open && setResetConfirmFlat(null)}>
            <DialogContent className="max-w-md rounded-2xl">
              <DialogHeader className="space-y-2">
                <DialogTitle className="flex items-center gap-2 text-amber-600">
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  <span>Reabrir Flat {resetConfirmFlat?.flatNumber}?</span>
                </DialogTitle>
                <DialogDescription className="text-sm leading-relaxed">
                  O status deste apartamento voltará para <strong>Pendente</strong>, cancelando o registro de
                  conclusão e liberando o flat para que o prestador possa executá-lo novamente pelo portal.
                </DialogDescription>
              </DialogHeader>

              <DialogFooter className="pt-4 flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setResetConfirmFlat(null)}
                  disabled={resetFlatMutation.isPending}
                >
                  Cancelar
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    if (resetConfirmFlat && effectiveTrackingOrderId) {
                      resetFlatMutation.mutate({
                        orderId: effectiveTrackingOrderId,
                        flatId: resetConfirmFlat.flatId,
                      });
                    }
                  }}
                  disabled={resetFlatMutation.isPending}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-semibold gap-1.5"
                >
                  {resetFlatMutation.isPending ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Resetando...
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-3.5 h-3.5" />
                      Confirmar Reabertura
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* ════════════════════════════════════════════════════════════════
              MODAL DE CONFIRMAÇÃO DE EXCLUSÃO DA ORDEM
             ════════════════════════════════════════════════════════════════ */}
          <Dialog open={Boolean(deleteConfirmOrderId)} onOpenChange={(open) => !open && setDeleteConfirmOrderId(null)}>
            <DialogContent className="max-w-md rounded-2xl">
              <DialogHeader className="space-y-2">
                <DialogTitle className="flex items-center gap-2 text-rose-600">
                  <Trash2 className="w-5 h-5 shrink-0" />
                  <span>Excluir Ordem de Serviço?</span>
                </DialogTitle>
                <DialogDescription className="text-sm leading-relaxed">
                  Esta ação removerá permanentemente a ordem de serviço, o link do portal e todos os registros
                  de identificação do prestador vinculados.
                </DialogDescription>
              </DialogHeader>

              <DialogFooter className="pt-4 flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDeleteConfirmOrderId(null)}
                  disabled={deleteOrderMutation.isPending}
                >
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (deleteConfirmOrderId) {
                      deleteOrderMutation.mutate(deleteConfirmOrderId);
                    }
                  }}
                  disabled={deleteOrderMutation.isPending}
                  className="font-semibold gap-1.5"
                >
                  {deleteOrderMutation.isPending ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Excluindo...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      Excluir Definitivamente
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </TooltipProvider>
    </Shell>
  );
}
