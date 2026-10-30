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
  Image as ImageIcon,
  Bell,
  Car,
  Phone,
  Lock
} from "lucide-react";

export type CleanFlatMode = "never" | "priority" | "always";
export type OrderStatus = "draft" | "active" | "closed";
export type FlatServiceStatus = "pending" | "in_progress" | "done";
export type InstructionFormat = "text" | "list";
export type NotificationEvent = "entry_request" | "start" | "finish" | "delay";

export const NOTIFICATION_EVENT_LABELS: Record<string, string> = {
  start: "Início",
  finish: "Conclusão",
  entry_request: "Pedido de Entrada",
  delay: "Atraso",
};

export type OperationalScenarioId =
  | "vago_limpo"
  | "vago_sujo"
  | "checkin_hoje_limpo"
  | "checkin_hoje_sujo"
  | "em_limpeza"
  | "stayover"
  | "checkout_pendente";

export interface ScenarioMeta {
  id: OperationalScenarioId;
  label: string;
  icon: string;
  description: string;
  defaultAllowed: boolean;
  warning?: string | null;
  hasGuestInside?: boolean;
}

export const OPERATIONAL_SCENARIOS_META: ScenarioMeta[] = [
  {
    id: "vago_limpo",
    label: "Vago & Limpo",
    icon: "🟢",
    description: "Apartamento vago, limpo e sem previsão de check-in para hoje.",
    defaultAllowed: true,
  },
  {
    id: "vago_sujo",
    label: "Vago & Sujo",
    icon: "🧹",
    description: "Pós-checkout já concluído ou vago sujo, sem check-in hoje.",
    defaultAllowed: true,
  },
  {
    id: "checkin_hoje_limpo",
    label: "Check-in Hoje (Limpo)",
    icon: "🔵",
    description: "Quarto limpo e preparado aguardando a chegada do hóspede hoje.",
    defaultAllowed: false,
    warning: "Hóspede previsto para chegar hoje. Verifique se o serviço não atrasará a entrada.",
  },
  {
    id: "checkin_hoje_sujo",
    label: "Check-in Hoje (Sujo)",
    icon: "🟡",
    description: "Hóspede chega hoje, mas quarto ainda está sujo aguardando faxina.",
    defaultAllowed: false,
    warning: "Hóspede chega hoje e o quarto ainda aguarda limpeza de camareira.",
  },
  {
    id: "em_limpeza",
    label: "Em Limpeza no Momento",
    icon: "🧽",
    description: "Camareira executando a faxina no apartamento agora.",
    defaultAllowed: false,
    warning: "Camareira em atendimento no apartamento no momento.",
  },
  {
    id: "stayover",
    label: "Hóspede em Estadia",
    icon: "🔴",
    description: "Hóspede ativo que dormiu ontem e continua hospedado.",
    defaultAllowed: false,
    warning: "⚠️ Hóspede no quarto. Bater na porta antes de entrar e verificar se foi comunicado.",
    hasGuestInside: true,
  },
  {
    id: "checkout_pendente",
    label: "Check-out Hoje Pendente",
    icon: "🟠",
    description: "Hóspede com saída prevista para hoje que ainda não desocupou.",
    defaultAllowed: false,
    warning: "⚠️ Hóspede no quarto aguardando check-out. Bater na porta antes de entrar.",
    hasGuestInside: true,
  },
];

export const DEFAULT_ALLOWED_ROOM_STATUSES: OperationalScenarioId[] = ["vago_limpo", "vago_sujo"];

export interface ServiceNotificationRecipient {
  id: string;
  name: string;
  phone: string;
  role?: "custom" | "reception" | "garage";
  events: NotificationEvent[];
}

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
  expectedArrival?: string | null;
  entryRequested?: boolean;
  entryRequestedAt?: string | null;
  delayNotified?: boolean;
  operationalScenario?: OperationalScenarioId;
  operationalScenarioLabel?: string;
  operationalScenarioIcon?: string;
  isStatusAllowed?: boolean;
  statusBlockReason?: string | null;
  hasGuestInside?: boolean;
  scenarioWarning?: string | null;
  isDirty?: boolean;
  isOccupied?: boolean;
  cleaningStatus?: string;
  occupancyStatus?: string;
  currentGuest?: string | null;
  hasCheckinToday?: boolean;
  hasCheckoutToday?: boolean;
  forceReleased?: boolean;
}

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

export interface ServiceOrder {
  id: string;
  title: string;
  serviceTypeId?: string;
  serviceTypeName?: string;
  token: string;
  status: OrderStatus;
  createdAt: string;
  createdBy?: string;
  cleanFlatMode: CleanFlatMode;
  allowedRoomStatuses?: string[];
  allowSimultaneousCleaning?: boolean;
  maxSimultaneousFlats: number;
  maxFlatsPerDay: number;
  requirePhotos: boolean;
  estimatedDurationHours?: number | null;
  instructionFormat: InstructionFormat;
  defaultInstructions?: string;
  notificationRecipients?: ServiceNotificationRecipient[];
  flats: ServiceFlat[];
  workerPhone?: string | null;
}

export interface ProgressWorker {
  id?: string;
  mainWorker?: { name: string; cpf: string };
  collaborators?: Array<{ name: string; cpf: string }>;
  vehicle?: {
    needsGarage: boolean;
    plate?: string;
    modelColor?: string;
  };
  registeredAt?: string;
}

export interface ServiceOrderProgressResponse {
  orderId: string;
  title: string;
  token: string;
  status: OrderStatus;
  notificationRecipients?: ServiceNotificationRecipient[];
  allowedRoomStatuses?: string[];
  allowSimultaneousCleaning?: boolean;
  cleanFlatMode?: CleanFlatMode;
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

function formatCpfInput(val: string): string {
  const digits = val.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

function cleanCpfDigits(val: string): string {
  return val.replace(/\D/g, "");
}

export default function ServiceOrders({ embedded = false }: { embedded?: boolean } = {}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Tab State: "list" | "form" | "tracking"
  const [activeTab, setActiveTab] = useState<"list" | "form" | "tracking">("list");

  // Query: Catálogo Oficial de Tipos de Serviço
  const { data: serviceCatalog = [] } = useQuery<ServiceCatalogItem[]>({
    queryKey: ["/api/service-catalog"],
    queryFn: async () => {
      const res = await fetch("/api/service-catalog", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

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

  const dirtyFlats = useMemo(() => activeFlats.filter((f: any) => Boolean(f.isDirty)), [activeFlats]);
  const cleanFlats = useMemo(() => activeFlats.filter((f: any) => !f.isDirty), [activeFlats]);
  const occupiedFlats = useMemo(() => activeFlats.filter((f: any) => Boolean(f.isOccupied)), [activeFlats]);
  const vacantFlats = useMemo(() => activeFlats.filter((f: any) => !f.isOccupied), [activeFlats]);

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
  const [formServiceTypeId, setFormServiceTypeId] = useState<string>("higienizacao_ac");
  const [showNewCatalogInline, setShowNewCatalogInline] = useState(false);
  const [newCatalogName, setNewCatalogName] = useState("");
  const [newCatalogIcon, setNewCatalogIcon] = useState("🔧");
  const [newCatalogInterval, setNewCatalogInterval] = useState<string>("90");
  const [formTitle, setFormTitle] = useState("");
  const [formWorkerName, setFormWorkerName] = useState("");
  const [formWorkerCpf, setFormWorkerCpf] = useState("");
  const [formWorkerPhone, setFormWorkerPhone] = useState("");
  const [formWorkerCollaborators, setFormWorkerCollaborators] = useState<Array<{ name: string; cpf: string }>>([]);
  const [formCleanFlatMode, setFormCleanFlatMode] = useState<CleanFlatMode>("always");
  const [formAllowedStatuses, setFormAllowedStatuses] = useState<OperationalScenarioId[]>(DEFAULT_ALLOWED_ROOM_STATUSES);
  const [formAllowSimultaneousCleaning, setFormAllowSimultaneousCleaning] = useState<boolean>(false);
  const [formMaxSimultaneous, setFormMaxSimultaneous] = useState<number>(2);
  const [formMaxPerDay, setFormMaxPerDay] = useState<number>(4);
  const [formRequirePhotos, setFormRequirePhotos] = useState<boolean>(true);
  const [formEstimatedDurationHours, setFormEstimatedDurationHours] = useState<number | "">(3);
  const [formInstructionFormat, setFormInstructionFormat] = useState<InstructionFormat>("text");
  const [formDefaultInstructions, setFormDefaultInstructions] = useState("");
  const [formSelectedFlatIds, setFormSelectedFlatIds] = useState<number[]>([]);
  const [formHasCustomInstructions, setFormHasCustomInstructions] = useState(false);
  const [formFlatCustomInstructions, setFormFlatCustomInstructions] = useState<Record<number, string>>({});

  const handleToggleAllowedStatus = (statusId: OperationalScenarioId) => {
    setFormAllowedStatuses((prev) =>
      prev.includes(statusId) ? prev.filter((id) => id !== statusId) : [...prev, statusId]
    );
  };

  // Presets de travas para o prestador (unifica modos legados:
  // setFormCleanFlatMode("never") -> Bloquear se o flat estiver limpo
  // setFormCleanFlatMode("priority") -> Só liberar flat limpo se nenhum outro flat do serviço estiver sujo
  // setFormCleanFlatMode("always") -> Liberar qualquer flat a qualquer momento conforme os 7 status abaixo)
  const applyStatusPreset = (preset: "default" | "dirty_only" | "any_vacant" | "all" | "clear") => {
    setFormCleanFlatMode("always");
    switch (preset) {
      case "default":
        setFormAllowedStatuses(["vago_limpo", "vago_sujo"]);
        break;
      case "dirty_only":
        setFormAllowedStatuses(["vago_sujo", "checkin_hoje_sujo"]);
        break;
      case "any_vacant":
        setFormAllowedStatuses(["vago_limpo", "vago_sujo", "checkin_hoje_limpo", "checkin_hoje_sujo"]);
        break;
      case "all":
        setFormAllowedStatuses([
          "vago_limpo",
          "vago_sujo",
          "checkin_hoje_limpo",
          "checkin_hoje_sujo",
          "em_limpeza",
          "stayover",
          "checkout_pendente",
        ]);
        break;
      case "clear":
        setFormAllowedStatuses([]);
        break;
    }
  };

  // Notification Recipients State (R2 / Configuração de quem recebe cada notificação)
  const DEFAULT_NOTIFICATION_RECIPIENTS: ServiceNotificationRecipient[] = [
    {
      id: "reception",
      name: "Recepção",
      phone: "5522997124021",
      role: "reception",
      events: ["entry_request", "start", "finish"],
    },
    {
      id: "garage",
      name: "Garagem / Portaria",
      phone: "5522997124021",
      role: "garage",
      events: ["entry_request"],
    },
    {
      id: "miller_admin",
      name: "Miller",
      phone: "22998505276",
      role: "custom",
      events: ["start", "finish"],
    },
  ];
  const [formRecipients, setFormRecipients] = useState<ServiceNotificationRecipient[]>(DEFAULT_NOTIFICATION_RECIPIENTS);

  const handleToggleRecipientEvent = (recId: string, event: NotificationEvent) => {
    setFormRecipients((prev) =>
      prev.map((r) => {
        if (r.id !== recId) return r;
        const exists = r.events.includes(event);
        const nextEvents = exists ? r.events.filter((e) => e !== event) : [...r.events, event];
        return { ...r, events: nextEvents };
      })
    );
  };

  const handleUpdateRecipient = (recId: string, patch: Partial<ServiceNotificationRecipient>) => {
    setFormRecipients((prev) =>
      prev.map((r) => (r.id === recId ? { ...r, ...patch } : r))
    );
  };

  const handleAddRecipient = () => {
    const newId = `rec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    setFormRecipients((prev) => [
      ...prev,
      {
        id: newId,
        name: "",
        phone: "",
        role: "custom",
        events: ["start", "finish"],
      },
    ]);
  };

  const handleRemoveRecipient = (recId: string) => {
    setFormRecipients((prev) => prev.filter((r) => r.id !== recId));
  };

  // Reset form to blank creation state
  const resetFormToCreate = () => {
    setEditingOrderId(null);
    setFormServiceTypeId("higienizacao_ac");
    setShowNewCatalogInline(false);
    setFormTitle("");
    setFormWorkerName("");
    setFormWorkerCpf("");
    setFormWorkerPhone("");
    setFormWorkerCollaborators([]);
    setFormCleanFlatMode("always");
    setFormAllowedStatuses(["vago_limpo", "vago_sujo"]);
    setFormAllowSimultaneousCleaning(false);
    setFormMaxSimultaneous(2);
    setFormMaxPerDay(4);
    setFormRequirePhotos(true);
    setFormEstimatedDurationHours(3);
    setFormInstructionFormat("text");
    setFormDefaultInstructions("");
    setFormRecipients(DEFAULT_NOTIFICATION_RECIPIENTS);
    // Default select all 19 active flats
    setFormSelectedFlatIds(activeFlats.map((f: any) => f.id));
    setFormHasCustomInstructions(false);
    setFormFlatCustomInstructions({});
  };

  // Load existing order into form for editing
  const loadOrderIntoForm = (order: ServiceOrder) => {
    setEditingOrderId(order.id);
    setFormServiceTypeId(order.serviceTypeId || "higienizacao_ac");
    setShowNewCatalogInline(false);
    setFormTitle(order.title || "");
    setFormWorkerName((order as any).workerName || "");
    setFormWorkerCpf(formatCpfInput((order as any).workerCpf || ""));
    setFormWorkerPhone((order as any).workerPhone || "");
    const rawCollabs = Array.isArray((order as any).workerCollaborators) ? (order as any).workerCollaborators : [];
    setFormWorkerCollaborators(
      rawCollabs.map((c: any) => ({
        name: String(c?.name || ""),
        cpf: formatCpfInput(String(c?.cpf || "")),
      }))
    );
    setFormCleanFlatMode("always");
    setFormAllowSimultaneousCleaning(Boolean(order.allowSimultaneousCleaning));

    if (Array.isArray(order.allowedRoomStatuses)) {
      setFormAllowedStatuses(order.allowedRoomStatuses as OperationalScenarioId[]);
    } else if (order.cleanFlatMode === "always") {
      setFormAllowedStatuses(["vago_limpo", "vago_sujo", "checkin_hoje_limpo", "checkin_hoje_sujo"]);
    } else if (order.cleanFlatMode === "never") {
      setFormAllowedStatuses(["vago_sujo"]);
    } else {
      setFormAllowedStatuses(["vago_limpo", "vago_sujo"]);
    }

    setFormMaxSimultaneous(order.maxSimultaneousFlats || 2);
    setFormMaxPerDay(order.maxFlatsPerDay || 4);
    setFormRequirePhotos(order.requirePhotos ?? true);
    setFormEstimatedDurationHours(order.estimatedDurationHours ?? "");
    setFormInstructionFormat(order.instructionFormat || "text");
    setFormDefaultInstructions(order.defaultInstructions || "");

    if (Array.isArray(order.notificationRecipients) && order.notificationRecipients.length > 0) {
      setFormRecipients(order.notificationRecipients);
    } else {
      setFormRecipients(DEFAULT_NOTIFICATION_RECIPIENTS);
    }

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

  // Mutation: Apagar prestador / ajudante / veículo (Admin)
  const deleteAdminWorkerMutation = useMutation({
    mutationFn: async (opts: { orderId: string; collaboratorIndex?: number; clearVehicle?: boolean }) => {
      const params = new URLSearchParams();
      if (opts.collaboratorIndex !== undefined) {
        params.set("collaboratorIndex", String(opts.collaboratorIndex));
      }
      if (opts.clearVehicle) {
        params.set("clearVehicle", "true");
      }
      const qs = params.toString() ? `?${params.toString()}` : "";
      const res = await fetch(`/api/service-orders/${opts.orderId}/worker${qs}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Falha ao remover prestador");
      }
      return { ...(await res.json()), opts };
    },
    onSuccess: (resData: any) => {
      if (resData.opts.collaboratorIndex !== undefined) {
        toast({
          title: "Ajudante removido!",
          description: "O ajudante foi excluído com sucesso.",
        });
      } else if (resData.opts.clearVehicle) {
        toast({
          title: "Veículo removido!",
          description: "Os dados de garagem do prestador foram apagados.",
        });
      } else {
        if (editingOrderId === resData.opts.orderId) {
          setFormWorkerName("");
          setFormWorkerCpf("");
          setFormWorkerPhone("");
          setFormWorkerCollaborators([]);
        }
        toast({
          title: "Prestador removido!",
          description: "O cadastro do prestador, ajudantes e veículo foi apagado desta ordem.",
        });
      }
      queryClient.invalidateQueries({ queryKey: ["service-orders"] });
      queryClient.invalidateQueries({ queryKey: ["service-order-progress", resData.opts.orderId] });
    },
    onError: (err: any) => {
      toast({
        title: "Erro ao remover prestador",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Mutation: Criar novo tipo de serviço no catálogo oficial
  const createCatalogItemMutation = useMutation({
    mutationFn: async () => {
      if (!newCatalogName.trim()) throw new Error("Informe o nome do tipo de serviço.");
      const res = await fetch("/api/service-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: newCatalogName.trim(),
          icon: newCatalogIcon || "🔧",
          category: "geral",
          recommendedIntervalDays: newCatalogInterval ? Number(newCatalogInterval) : null,
          requiresExternalPortal: true,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erro ao adicionar tipo de serviço.");
      }
      return res.json();
    },
    onSuccess: (created: ServiceCatalogItem) => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-catalog"] });
      queryClient.invalidateQueries({ queryKey: ["/api/flats/xray"] });
      setFormServiceTypeId(created.id);
      if (!formTitle.trim()) {
        setFormTitle(created.name);
      }
      setShowNewCatalogInline(false);
      setNewCatalogName("");
      toast({
        title: "Tipo adicionado à Lista Oficial!",
        description: `"${created.name}" agora faz parte do catálogo de serviços recorrentes.`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Erro ao criar tipo de serviço",
        description: err.message,
        variant: "destructive",
      });
    },
  });

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

      const trimmedWorkerName = formWorkerName.trim();
      const cleanedWorkerCpf = cleanCpfDigits(formWorkerCpf);
      const cleanedWorkerPhone = formWorkerPhone ? formWorkerPhone.replace(/\D/g, "") : "";
      const cleanedCollabs = formWorkerCollaborators
        .map((c) => ({
          name: c.name.trim(),
          cpf: cleanCpfDigits(c.cpf),
        }))
        .filter((c) => c.name.length > 0 && c.cpf.length === 11);

      const shouldClearWorker = Boolean(editingOrderId && !trimmedWorkerName && !cleanedWorkerCpf && !cleanedWorkerPhone);

      const selectedCatalogItem = serviceCatalog.find((c) => c.id === formServiceTypeId);

      const bodyPayload = {
        title: formTitle.trim(),
        serviceTypeId: formServiceTypeId || undefined,
        serviceTypeName: selectedCatalogItem?.name || undefined,
        cleanFlatMode: "always" as CleanFlatMode,
        allowedRoomStatuses: formAllowedStatuses,
        allowSimultaneousCleaning: Boolean(formAllowSimultaneousCleaning),
        maxSimultaneousFlats: Number(formMaxSimultaneous) || 2,
        maxFlatsPerDay: Number(formMaxPerDay) || 4,
        requirePhotos: Boolean(formRequirePhotos),
        estimatedDurationHours: formEstimatedDurationHours ? Number(formEstimatedDurationHours) : null,
        instructionFormat: formInstructionFormat,
        defaultInstructions: formDefaultInstructions.trim(),
        notificationRecipients: formRecipients,
        clearWorker: shouldClearWorker,
        workerName: trimmedWorkerName,
        workerCpf: cleanedWorkerCpf,
        workerPhone: cleanedWorkerPhone,
        workerCollaborators: cleanedCollabs,
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
      queryClient.invalidateQueries({ queryKey: ["/api/flats/xray"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/flats/xray"] });
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

  // Mutation: Concluir Flat diretamente pelo Admin (alimenta Raio-X / Diário)
  const adminCompleteFlatMutation = useMutation({
    mutationFn: async ({ orderId, flatId, observations }: { orderId: string; flatId: number; observations?: string }) => {
      const res = await fetch(`/api/service-orders/${orderId}/flats/${flatId}/admin-complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ observations }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Falha ao concluir flat.");
      }
      return res.json();
    },
    onSuccess: (data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["service-orders"] });
      queryClient.invalidateQueries({ queryKey: ["service-order-progress", vars.orderId] });
      queryClient.invalidateQueries({ queryKey: ["/api/flats/xray"] });
      toast({
        title: "Flat marcado como concluído!",
        description: `A execução foi registrada no acompanhamento e no Raio-X do Flat.`,
      });
      if (detailModalFlat && detailModalFlat.flatId === vars.flatId) {
        setDetailModalFlat((prev) =>
          prev
            ? {
                ...prev,
                status: "done",
                finishedAt: new Date().toISOString(),
              }
            : null
        );
      }
    },
    onError: (err: any) => {
      toast({
        title: "Erro ao concluir flat",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const forceReleaseMutation = useMutation({
    mutationFn: async ({ orderId, flatId, forceReleased }: { orderId: string; flatId: number; forceReleased: boolean }) => {
      const res = await fetch(`/api/service-orders/${orderId}/flats/${flatId}/force-release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ forceReleased }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Falha ao alterar liberação do flat.");
      }
      return res.json();
    },
    onSuccess: (data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["service-orders"] });
      queryClient.invalidateQueries({ queryKey: ["service-order-progress", vars.orderId] });
      toast({
        title: vars.forceReleased ? "Flat liberado manualmente!" : "Liberação manual revogada!",
        description: vars.forceReleased
          ? `O Flat ${vars.flatId} foi desbloqueado para execução pelo prestador.`
          : `O Flat ${vars.flatId} voltou às restrições normais de status.`,
      });
      if (detailModalFlat && detailModalFlat.flatId === vars.flatId) {
        setDetailModalFlat((prev) =>
          prev
            ? {
                ...prev,
                forceReleased: vars.forceReleased,
                isStatusAllowed: vars.forceReleased || prev.isStatusAllowed,
              }
            : null
        );
      }
    },
    onError: (err: any) => {
      toast({
        title: "Erro na liberação do flat",
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

  const pageContent = (
      <TooltipProvider>
        <div className={embedded ? "w-full min-w-0 max-w-full space-y-4 sm:space-y-6 overflow-x-hidden" : "w-full max-w-7xl min-w-0 mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-6 pb-24 sm:pb-10 space-y-4 sm:space-y-6 overflow-x-hidden"}>
          {/* Header principal da página */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/40 pb-3.5 sm:pb-5 min-w-0">
            <div className="space-y-1 min-w-0">
              <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0">
                <div className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shadow-xs mt-0.5 sm:mt-0">
                  <Wrench className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="text-base sm:text-2xl font-bold tracking-tight text-foreground leading-tight break-words">
                    Campanhas & Serviços Externos (Terceirizados)
                  </h1>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 leading-snug break-words">
                    Gestão de higienização de A/C, dedetização, pintores e reformas com portal exclusivo e vínculo ao Raio-X dos Flats
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto shrink-0">
              <Button
                variant={activeTab === "form" && !editingOrderId ? "secondary" : "default"}
                onClick={() => {
                  resetFormToCreate();
                  setActiveTab("form");
                }}
                className="w-full sm:w-auto h-9 sm:h-10 text-xs sm:text-sm justify-center gap-2 font-semibold shadow-xs rounded-xl"
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span>Nova Ordem de Serviço</span>
              </Button>
            </div>
          </div>

          {/* Abas de Navegação Principais */}
          <Tabs
            value={activeTab}
            onValueChange={(val) => setActiveTab(val as "list" | "form" | "tracking")}
            className="w-full min-w-0 space-y-4 sm:space-y-6"
          >
            <TabsList className="grid grid-cols-3 w-full sm:max-w-lg h-auto min-h-10 sm:min-h-11 p-1 bg-muted/80 rounded-xl gap-1">
              <TabsTrigger value="list" className="min-w-0 overflow-hidden gap-1 sm:gap-2 text-[11px] sm:text-sm font-semibold rounded-lg px-1 sm:px-3 py-1.5">
                <FileText className="w-3.5 h-3.5 hidden sm:inline-block shrink-0" />
                <span className="truncate">Lista</span>
                <span className="hidden xs:inline truncate">de Serviços</span>
                {orders.length > 0 && (
                  <Badge variant="secondary" className="ml-0.5 px-1 sm:px-1.5 py-0 text-[9px] sm:text-[10px] font-semibold shrink-0">
                    {orders.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="form" className="min-w-0 overflow-hidden gap-1 sm:gap-2 text-[11px] sm:text-sm font-semibold rounded-lg px-1 sm:px-3 py-1.5">
                <Edit className="w-3.5 h-3.5 hidden sm:inline-block shrink-0" />
                <span className="truncate">{editingOrderId ? "Editar Ordem" : "Criar Ordem"}</span>
              </TabsTrigger>
              <TabsTrigger value="tracking" className="min-w-0 overflow-hidden gap-1 sm:gap-2 text-[11px] sm:text-sm font-semibold rounded-lg px-1 sm:px-3 py-1.5">
                <Layers className="w-3.5 h-3.5 hidden sm:inline-block shrink-0" />
                <span className="truncate">Acompanhamento</span>
                {progressData?.stats?.inProgress ? (
                  <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse shrink-0" />
                ) : null}
              </TabsTrigger>
            </TabsList>

            {/* ════════════════════════════════════════════════════════════════
                ABA 1: LISTA DE ORDENS DE SERVIÇO
               ════════════════════════════════════════════════════════════════ */}
            <TabsContent value="list" className="w-full min-w-0 space-y-5 sm:space-y-6 focus-visible:outline-none">
              {/* Barra de Filtros e Busca */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 bg-card p-3 rounded-2xl border shadow-xs min-w-0">
                <div className="relative flex-1 min-w-0">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por título ou token da ordem..."
                    value={listSearch}
                    onChange={(e) => setListSearch(e.target.value)}
                    className="pl-9 h-9 text-xs sm:text-sm"
                  />
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Select value={listStatusFilter} onValueChange={setListStatusFilter}>
                    <SelectTrigger className="flex-1 sm:w-40 h-9 text-xs">
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
                    className="h-9 px-2.5 shrink-0"
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
                        className="rounded-2xl border bg-card shadow-xs hover:shadow-md transition-all flex flex-col justify-between overflow-hidden min-w-0"
                      >
                        <CardHeader className="pb-3 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1 flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
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
                                {(order.serviceTypeName || order.serviceTypeId) && (
                                  <Badge variant="outline" className="text-[10px] font-semibold px-2 py-0.5 bg-primary/10 text-primary border-primary/25">
                                    {serviceCatalog.find((c) => c.id === order.serviceTypeId)?.icon || "🔧"}{" "}
                                    {order.serviceTypeName || serviceCatalog.find((c) => c.id === order.serviceTypeId)?.name}
                                  </Badge>
                                )}
                              </div>
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
                              🔓 {(order.allowedRoomStatuses || DEFAULT_ALLOWED_ROOM_STATUSES).length}/7 status liberados
                            </Badge>
                            <Badge
                              variant="outline"
                              className={`text-[10px] font-normal py-0.5 px-2 ${
                                order.allowSimultaneousCleaning
                                  ? "border-emerald-300 text-emerald-700 dark:text-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/30"
                                  : "bg-muted/40"
                              }`}
                            >
                              {order.allowSimultaneousCleaning ? "🧽 Limpeza simultânea permitida" : "🔒 Bloqueia limpeza durante serviço"}
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
                          <div className="space-y-1.5 p-2.5 rounded-xl bg-muted/50 border text-xs min-w-0">
                            <span className="font-semibold text-foreground block">
                              Link de Acesso do Prestador:
                            </span>
                            <div className="flex items-center gap-1.5 min-w-0">
                              <code className="flex-1 min-w-0 bg-background px-2 py-1 rounded border text-[11px] font-mono text-muted-foreground truncate select-all">
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
            <TabsContent value="form" className="w-full min-w-0 space-y-6 focus-visible:outline-none">
              <Card className="rounded-2xl border shadow-xs overflow-hidden">
                <CardHeader className="border-b p-4 sm:p-6 pb-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setActiveTab("list")}
                        className="h-8 px-2 -ml-2 text-muted-foreground hover:text-foreground gap-1 shrink-0"
                      >
                        <ArrowLeft className="w-4 h-4" />
                        <span>Voltar</span>
                      </Button>

                      {editingOrderId && (
                        <Badge variant="outline" className="text-[10px] sm:text-xs font-mono max-w-[210px] sm:max-w-none truncate">
                          ID: {editingOrderId}
                        </Badge>
                      )}
                    </div>

                    <div className="space-y-1">
                      <CardTitle className="text-lg sm:text-xl font-bold leading-snug">
                        {editingOrderId ? "Editar Ordem de Serviço" : "Nova Ordem de Serviço"}
                      </CardTitle>
                      <CardDescription className="text-xs sm:text-sm leading-relaxed">
                        Configure os flats, regras de limpeza e orientações para o prestador externo.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-6 p-4 sm:p-6 pt-5 sm:pt-6">
                  {/* 0. Tipo Oficial de Serviço do Catálogo (sincronizado com o Raio-X dos Flats) */}
                  <div className="p-4 rounded-xl border bg-primary/5 border-primary/20 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
                          <Sparkles className="w-4 h-4 text-primary" />
                          Tipo Oficial do Serviço (Catálogo do Raio-X dos Flats) <span className="text-rose-500">*</span>
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Vincular ao catálogo oficial permite que o sistema atualize automaticamente no Raio-X quais flats já fizeram este serviço e quando vence a próxima execução.
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowNewCatalogInline((v) => !v)}
                        className="h-8 text-xs gap-1.5 shrink-0 self-start sm:self-center"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{showNewCatalogInline ? "Fechar Novo Tipo" : "+ Criar Novo Tipo na Lista"}</span>
                      </Button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {serviceCatalog.map((cat) => {
                        const selected = formServiceTypeId === cat.id;
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => {
                              setFormServiceTypeId(cat.id);
                              if (!formTitle.trim() || serviceCatalog.some((c) => c.name === formTitle.trim())) {
                                setFormTitle(cat.name);
                              }
                            }}
                            className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all ${
                              selected
                                ? "bg-primary text-primary-foreground border-primary shadow-xs"
                                : "bg-background hover:bg-muted border-border text-foreground"
                            }`}
                          >
                            <span>{cat.icon || "🔧"}</span>
                            <span>{cat.name}</span>
                            {cat.recommendedIntervalDays ? (
                              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${selected ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                                {cat.recommendedIntervalDays}d
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>

                    {showNewCatalogInline && (
                      <div className="p-3 rounded-xl bg-background border space-y-2.5">
                        <span className="text-xs font-bold text-foreground block">
                          Adicionar novo tipo permanente ao Catálogo Oficial de Serviços:
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                          <Input
                            placeholder="Ícone (ex: ❄️, 🪲, 🪟)"
                            value={newCatalogIcon}
                            onChange={(e) => setNewCatalogIcon(e.target.value)}
                            className="h-9 text-xs sm:col-span-1"
                          />
                          <Input
                            placeholder="Nome do tipo (ex: Limpeza de Sofá / Estofados)"
                            value={newCatalogName}
                            onChange={(e) => setNewCatalogName(e.target.value)}
                            className="h-9 text-xs sm:col-span-2"
                          />
                          <Input
                            type="number"
                            placeholder="Ciclo em dias (ex: 180)"
                            value={newCatalogInterval}
                            onChange={(e) => setNewCatalogInterval(e.target.value)}
                            className="h-9 text-xs sm:col-span-1"
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => createCatalogItemMutation.mutate()}
                            disabled={createCatalogItemMutation.isPending}
                            className="h-8 text-xs font-semibold"
                          >
                            {createCatalogItemMutation.isPending ? "Adicionando..." : "Salvar Novo Tipo no Catálogo"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 1. Título do Serviço */}
                  <div className="space-y-2">
                    <Label htmlFor="service-title" className="text-sm font-semibold flex items-center gap-1.5">
                      Título da Campanha / Ordem de Serviço <span className="text-rose-500">*</span>
                    </Label>
                    <Input
                      id="service-title"
                      placeholder="Ex: Higienização de Ar-Condicionado — Outubro / 2026"
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      className="text-base py-5 rounded-xl font-medium"
                    />
                    <p className="text-xs text-muted-foreground">
                      Este nome será exibido ao prestador no portal e registrado no Diário de cada flat concluído.
                    </p>
                  </div>

                  {/* Prestador / Responsável (Opcional - Pré-atribuição) */}
                  <div className="p-4 rounded-xl bg-muted/30 border space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-semibold flex items-center gap-1.5">
                          <Users className="w-4 h-4 text-primary" />
                          Prestador Responsável (Opcional - Pré-atribuição)
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Se você já sabe quem executará o serviço, preencha abaixo. O prestador receberá WhatsApp automático quando houver quarto disponível.
                        </p>
                      </div>

                      {(formWorkerName || formWorkerCpf || formWorkerPhone || formWorkerCollaborators.length > 0) && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={deleteAdminWorkerMutation.isPending}
                          onClick={() => {
                            setFormWorkerName("");
                            setFormWorkerCpf("");
                            setFormWorkerPhone("");
                            setFormWorkerCollaborators([]);
                            if (editingOrderId) {
                              deleteAdminWorkerMutation.mutate({ orderId: editingOrderId });
                            }
                          }}
                          className="h-8 text-xs text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700 gap-1.5 shrink-0 self-start sm:self-center"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Apagar Prestador e Ajudantes
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor="worker-name" className="text-xs font-semibold">
                          Nome do Prestador / Empresa
                        </Label>
                        <Input
                          id="worker-name"
                          placeholder="Ex: Carlos Pinturas ME"
                          value={formWorkerName}
                          onChange={(e) => setFormWorkerName(e.target.value)}
                          className="h-9 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="worker-cpf" className="text-xs font-semibold">
                          CPF do Prestador
                        </Label>
                        <Input
                          id="worker-cpf"
                          placeholder="000.000.000-00"
                          value={formWorkerCpf}
                          onChange={(e) => setFormWorkerCpf(formatCpfInput(e.target.value))}
                          maxLength={14}
                          className="h-9 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="worker-phone" className="text-xs font-semibold">
                          WhatsApp / Telefone (Avisos de Quartos)
                        </Label>
                        <Input
                          id="worker-phone"
                          placeholder="Ex: (22) 99850-5276"
                          value={formWorkerPhone}
                          onChange={(e) => setFormWorkerPhone(e.target.value)}
                          className="h-9 text-xs"
                        />
                      </div>
                    </div>

                    {/* Ajudantes / Equipe na Edição do Admin */}
                    <div className="pt-2 border-t space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-xs font-semibold text-muted-foreground">
                          Ajudantes / Equipe ({formWorkerCollaborators.length})
                        </Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setFormWorkerCollaborators((prev) => [...prev, { name: "", cpf: "" }])
                          }
                          className="h-7 text-xs gap-1 border-dashed"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          + Adicionar Ajudante
                        </Button>
                      </div>

                      {formWorkerCollaborators.length > 0 && (
                        <div className="space-y-2">
                          {formWorkerCollaborators.map((collab, idx) => (
                            <div key={idx} className="flex items-center gap-2 bg-background p-2 rounded-lg border">
                              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <Input
                                  placeholder="Nome do ajudante"
                                  value={collab.name}
                                  onChange={(e) =>
                                    setFormWorkerCollaborators((prev) =>
                                      prev.map((c, i) => (i === idx ? { ...c, name: e.target.value } : c))
                                    )
                                  }
                                  className="h-8 text-xs"
                                />
                                <Input
                                  placeholder="CPF (000.000.000-00)"
                                  value={collab.cpf}
                                  onChange={(e) =>
                                    setFormWorkerCollaborators((prev) =>
                                      prev.map((c, i) =>
                                        i === idx ? { ...c, cpf: formatCpfInput(e.target.value) } : c
                                      )
                                    )
                                  }
                                  maxLength={14}
                                  className="h-8 text-xs"
                                />
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  setFormWorkerCollaborators((prev) => prev.filter((_, i) => i !== idx))
                                }
                                title="Remover ajudante"
                                className="h-8 w-8 text-rose-500 hover:text-rose-600 hover:bg-rose-50 shrink-0"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 2. Travas de Liberação de Quartos para o Prestador (7 Cenários Operacionais) */}
                  <div className="space-y-3 p-4 rounded-xl border bg-card/60">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-semibold flex items-center gap-1.5">
                          🔒 Travas de Liberação de Quartos para o Prestador <span className="text-rose-500">*</span>
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Defina em quais situações de quarto o <strong>prestador</strong> terá permissão para solicitar entrada e iniciar o serviço. Os flats participantes que estiverem fora dessas travas aparecerão bloqueados com cadeado 🔒 no link do prestador até que mudem de status.
                        </p>
                      </div>

                      {/* Presets Toolbar */}
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-[11px] font-semibold text-muted-foreground mr-1">Atalhos:</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px] px-2"
                          onClick={() => applyStatusPreset("default")}
                        >
                          Padrão
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px] px-2"
                          onClick={() => applyStatusPreset("dirty_only")}
                        >
                          Apenas Sujos
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px] px-2"
                          onClick={() => applyStatusPreset("any_vacant")}
                        >
                          Qualquer Vago
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px] px-2"
                          onClick={() => applyStatusPreset("all")}
                        >
                          Selecionar Todos
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-[11px] px-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                          onClick={() => applyStatusPreset("clear")}
                        >
                          Limpar Seleção
                        </Button>
                      </div>
                    </div>

                    {/* Warning if Stayover or Checkout Pendente is active */}
                    {(formAllowedStatuses.includes("stayover") || formAllowedStatuses.includes("checkout_pendente")) && (
                      <div className="p-3 rounded-lg border border-amber-300 bg-amber-500/10 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2 animate-in fade-in">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold">⚠️ Atenção: Quartos com Hóspede Autorizados!</span>
                          <p className="mt-0.5 text-[11px] leading-relaxed">
                            O prestador verá um aviso em destaque e precisará confirmar obrigatoriamente um alerta no portal antes de entrar, lembrando de bater na porta e alinhar com a recepção. A notificação de WhatsApp para a recepção também conterá alerta de hóspede presente.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Warning if no status is active */}
                    {formAllowedStatuses.length === 0 && (
                      <div className="p-3 rounded-lg border border-rose-300 bg-rose-500/10 text-rose-900 dark:text-rose-200 text-xs flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold">Nenhum status permitido!</span>
                          <p className="mt-0.5 text-[11px]">
                            Todos os quartos ficarão com cadeado 🔒 e bloqueados para o prestador até que ao menos um status seja marcado.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* 7 Scenario Cards Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 pt-1">
                      {OPERATIONAL_SCENARIOS_META.map((scenario) => {
                        const isChecked = formAllowedStatuses.includes(scenario.id);
                        return (
                          <div
                            key={scenario.id}
                            onClick={() => handleToggleAllowedStatus(scenario.id)}
                            className={`cursor-pointer p-3 rounded-xl border transition-all flex flex-col justify-between gap-2 ${
                              isChecked
                                ? "border-primary bg-primary/5 shadow-xs"
                                : "border-border/60 hover:border-border hover:bg-muted/30 opacity-70"
                            }`}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                                  <span>{scenario.icon}</span>
                                  <span>{scenario.label}</span>
                                </span>
                                <Checkbox
                                  checked={isChecked}
                                  onCheckedChange={() => handleToggleAllowedStatus(scenario.id)}
                                  className="data-[state=checked]:bg-primary"
                                />
                              </div>
                              <p className="text-[11px] text-muted-foreground leading-snug">
                                {scenario.description}
                              </p>
                            </div>

                            {scenario.hasGuestInside && (
                              <Badge variant="outline" className="text-[9px] w-fit font-bold border-rose-300 text-rose-700 dark:text-rose-300 bg-rose-50/50 dark:bg-rose-950/30">
                                🔴 Hóspede no quarto
                              </Badge>
                            )}
                            {scenario.id === "em_limpeza" && (
                              <Badge variant="outline" className="text-[9px] w-fit font-bold border-purple-300 text-purple-700 dark:text-purple-300 bg-purple-50/50 dark:bg-purple-950/30">
                                🧽 Camareira no local
                              </Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 2B. Regra de Limpeza Durante o Serviço (Independente) */}
                  <div className="space-y-3 p-4 rounded-xl bg-muted/40 border">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-bold text-foreground">
                        Limpeza do Flat Durante o Serviço Externo <span className="text-rose-500">*</span>
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Defina se a equipe de governança pode iniciar ou concluir a limpeza de um flat enquanto o prestador estiver com o serviço em andamento naquele quarto.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      <div
                        onClick={() => setFormAllowSimultaneousCleaning(false)}
                        data-testid="option-block-simultaneous-cleaning"
                        className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between gap-2 ${
                          !formAllowSimultaneousCleaning
                            ? "border-primary bg-primary/5 shadow-xs"
                            : "border-border/60 hover:border-border hover:bg-muted/30 opacity-75"
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                              <span>🔒</span>
                              <span>Bloquear limpeza durante o serviço</span>
                            </span>
                            <Badge
                              variant={!formAllowSimultaneousCleaning ? "default" : "outline"}
                              className="text-[9px] py-0 px-1.5"
                            >
                              Padrão
                            </Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-snug">
                            Enquanto o prestador estiver com o serviço em andamento no flat, a limpeza fica bloqueada para camareiras (o Admin continua podendo iniciar/marcar limpo).
                          </p>
                        </div>
                      </div>

                      <div
                        onClick={() => setFormAllowSimultaneousCleaning(true)}
                        data-testid="option-allow-simultaneous-cleaning"
                        className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between gap-2 ${
                          formAllowSimultaneousCleaning
                            ? "border-emerald-600 bg-emerald-500/10 shadow-xs"
                            : "border-border/60 hover:border-border hover:bg-muted/30 opacity-75"
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                              <span>🧽</span>
                              <span>Permitir limpeza simultânea</span>
                            </span>
                            {formAllowSimultaneousCleaning && (
                              <Badge className="text-[9px] py-0 px-1.5 bg-emerald-600 text-white">
                                Ativo
                              </Badge>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-snug">
                            Camareiras e Admin podem iniciar e concluir a limpeza do flat mesmo enquanto o serviço externo estiver em andamento no local.
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

                  {/* Notificações e Destinatários Configurados (R2) */}
                  <div className="p-4 rounded-xl border bg-muted/20 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
                          <Bell className="w-4 h-4 text-primary" />
                          Destinatários de Notificações (WhatsApp e Sistema)
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Cadastre quem deve ser notificado e selecione quais mensagens cada pessoa ou setor receberá.
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (!formRecipients.some((r) => r.phone.includes("22998505276") || r.name.toLowerCase().includes("miller"))) {
                              setFormRecipients((prev) => [
                                ...prev,
                                {
                                  id: `rec_miller_${Date.now()}`,
                                  name: "Miller",
                                  phone: "22998505276",
                                  role: "custom",
                                  events: ["start", "finish"],
                                },
                              ]);
                            }
                          }}
                          className="h-7 text-[11px] px-2"
                        >
                          + Miller (22998505276)
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (!formRecipients.some((r) => r.phone.includes("229999999") || r.name.toLowerCase().includes("grazi"))) {
                              setFormRecipients((prev) => [
                                ...prev,
                                {
                                  id: `rec_grazi_${Date.now()}`,
                                  name: "Grazi",
                                  phone: "229999999",
                                  role: "custom",
                                  events: ["finish"],
                                },
                              ]);
                            }
                          }}
                          className="h-7 text-[11px] px-2"
                        >
                          + Grazi (229999999)
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (!formRecipients.some((r) => r.role === "reception" || r.id === "reception")) {
                              setFormRecipients((prev) => [
                                ...prev,
                                {
                                  id: "reception",
                                  name: "Recepção",
                                  phone: "5522997124021",
                                  role: "reception",
                                  events: ["entry_request", "start", "finish"],
                                },
                              ]);
                            }
                          }}
                          className="h-7 text-[11px] px-2"
                        >
                          + Recepção
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (!formRecipients.some((r) => r.role === "garage" || r.id === "garage")) {
                              setFormRecipients((prev) => [
                                ...prev,
                                {
                                  id: "garage",
                                  name: "Garagem / Portaria",
                                  phone: "5522997124021",
                                  role: "garage",
                                  events: ["entry_request"],
                                },
                              ]);
                            }
                          }}
                          className="h-7 text-[11px] px-2"
                        >
                          + Garagem
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleAddRecipient}
                          className="h-7 text-[11px] px-2 border-dashed border-primary/50 text-primary hover:text-primary hover:bg-primary/10 self-start sm:self-auto"
                        >
                          <Plus className="w-3.5 h-3.5 mr-1" />
                          + Outra Pessoa
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {formRecipients.map((rec) => {
                        const isPresetReception = rec.role === "reception" || rec.id === "reception";
                        const isPresetGarage = rec.role === "garage" || rec.id === "garage";

                        return (
                          <div
                            key={rec.id}
                            className="p-3 sm:p-3.5 bg-card border rounded-xl shadow-2xs space-y-3"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b pb-2.5">
                              <div className="flex items-center gap-2 w-full sm:flex-1 min-w-0">
                                {isPresetReception ? (
                                  <Badge className="bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 border-sky-300 text-[10px] uppercase font-bold shrink-0">
                                    🏢 Recepção
                                  </Badge>
                                ) : isPresetGarage ? (
                                  <Badge className="bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border-indigo-300 text-[10px] uppercase font-bold shrink-0">
                                    🚗 Garagem / Portaria
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[10px] font-bold shrink-0">
                                    👤 Pessoa
                                  </Badge>
                                )}

                                <Input
                                  placeholder="Nome da pessoa ou setor"
                                  value={rec.name}
                                  onChange={(e) => handleUpdateRecipient(rec.id, { name: e.target.value })}
                                  className="h-8 text-xs font-semibold flex-1 min-w-0"
                                />
                              </div>

                              <div className="flex items-center gap-2 w-full sm:w-auto">
                                <div className="flex items-center gap-1.5 flex-1 sm:flex-initial">
                                  <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                  <Input
                                    placeholder="WhatsApp (ex: 22998505276)"
                                    value={rec.phone}
                                    onChange={(e) => handleUpdateRecipient(rec.id, { phone: e.target.value })}
                                    className="h-8 text-xs w-full sm:w-[160px]"
                                  />
                                </div>

                                {!isPresetReception && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleRemoveRecipient(rec.id)}
                                    className="h-8 w-8 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 shrink-0"
                                    title="Remover destinatário"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                              </div>
                            </div>

                            {/* Event selection checkboxes */}
                            <div className="space-y-1.5">
                              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                                Notificações que este destinatário recebe:
                              </span>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-0.5">
                                <label
                                  className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer select-none transition-colors ${
                                    rec.events.includes("entry_request")
                                      ? "bg-amber-500/10 border-amber-500/40 font-semibold text-foreground"
                                      : "bg-muted/30 border-transparent text-muted-foreground hover:bg-muted/50"
                                  }`}
                                >
                                  <Checkbox
                                    checked={rec.events.includes("entry_request")}
                                    onCheckedChange={() => handleToggleRecipientEvent(rec.id, "entry_request")}
                                  />
                                  <span>🔑 Liberação de Entrada</span>
                                </label>

                                <label
                                  className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer select-none transition-colors ${
                                    rec.events.includes("start")
                                      ? "bg-sky-500/10 border-sky-500/40 font-semibold text-foreground"
                                      : "bg-muted/30 border-transparent text-muted-foreground hover:bg-muted/50"
                                  }`}
                                >
                                  <Checkbox
                                    checked={rec.events.includes("start")}
                                    onCheckedChange={() => handleToggleRecipientEvent(rec.id, "start")}
                                  />
                                  <span>▶️ Início de Serviço</span>
                                </label>

                                <label
                                  className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer select-none transition-colors ${
                                    rec.events.includes("finish")
                                      ? "bg-emerald-500/10 border-emerald-500/40 font-semibold text-foreground"
                                      : "bg-muted/30 border-transparent text-muted-foreground hover:bg-muted/50"
                                  }`}
                                >
                                  <Checkbox
                                    checked={rec.events.includes("finish")}
                                    onCheckedChange={() => handleToggleRecipientEvent(rec.id, "finish")}
                                  />
                                  <span>🏁 Fim de Serviço</span>
                                </label>

                                <label
                                  className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer select-none transition-colors ${
                                    rec.events.includes("delay")
                                      ? "bg-rose-500/10 border-rose-500/40 font-semibold text-foreground"
                                      : "bg-muted/30 border-transparent text-muted-foreground hover:bg-muted/50"
                                  }`}
                                >
                                  <Checkbox
                                    checked={rec.events.includes("delay")}
                                    onCheckedChange={() => handleToggleRecipientEvent(rec.id, "delay")}
                                  />
                                  <span>⏱️ Atraso / Previsão</span>
                                </label>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
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
                          {formSelectedFlatIds.length !== 1 ? "s" : ""} de {activeFlats.length} ativos — selecione todos os flats que precisam do serviço independente do status atual (o portal do prestador aplicará as travas configuradas acima).
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
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
                      <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-10 gap-2.5">
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
                              className={`cursor-pointer select-none p-3 rounded-xl border text-center transition-all flex items-center justify-between gap-2 ${
                                isSelected
                                  ? "border-primary bg-primary/10 shadow-xs font-semibold text-primary"
                                  : "border-border/60 hover:bg-muted/40 text-muted-foreground"
                              }`}
                            >
                              <span className="text-base font-bold text-foreground">
                                {flat.number}
                              </span>
                              <div
                                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                  isSelected
                                    ? "bg-primary border-primary text-primary-foreground"
                                    : "border-muted-foreground/40 bg-background"
                                }`}
                              >
                                {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                              </div>
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
                <CardFooter className="border-t pt-4 pb-5 px-4 sm:px-6 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 bg-muted/20">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setActiveTab("list")}
                    disabled={saveMutation.isPending}
                    className="font-medium w-full sm:w-auto"
                  >
                    Cancelar
                  </Button>

                  <Button
                    type="button"
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                    className="gap-2 font-semibold px-6 shadow-xs w-full sm:w-auto"
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
            <TabsContent value="tracking" className="w-full min-w-0 space-y-5 sm:space-y-6 focus-visible:outline-none">
              {/* Barra Superior de Seleção e Polling */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 bg-card p-3.5 sm:p-4 rounded-2xl border shadow-xs min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3 flex-1 min-w-0">
                  <div className="space-y-1 w-full sm:w-auto min-w-0">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
                      Ordem Selecionada
                    </span>
                    <Select
                      value={effectiveTrackingOrderId}
                      onValueChange={(val) => setSelectedTrackingOrderId(val)}
                    >
                      <SelectTrigger className="w-full sm:w-80 max-w-full min-w-0 h-10 font-semibold text-xs sm:text-sm [&>span]:truncate">
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
                    <div className="flex items-center gap-1.5 w-full sm:w-auto pt-0.5 sm:pt-4 min-w-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyPortalLink(progressData.token)}
                        className="h-9 sm:h-8 text-xs gap-1.5 font-medium flex-1 sm:flex-initial min-w-0"
                      >
                        <Copy className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">Copiar Link do Portal</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        asChild
                        className="h-9 sm:h-8 px-2.5 shrink-0"
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

                <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3 w-full sm:w-auto border-t sm:border-t-0 pt-2.5 sm:pt-0 min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-muted-foreground bg-muted/60 px-2.5 sm:px-3 py-1.5 rounded-lg min-w-0">
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="font-medium truncate">Atualizando a cada 10s</span>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchProgress()}
                    disabled={progressFetching}
                    className="h-9 gap-1.5 text-xs font-semibold shrink-0"
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
                <div className="space-y-4 sm:space-y-5 min-w-0">
                  {/* Cards de Métricas (KPIs) */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2.5 sm:gap-3.5">
                    {/* Total */}
                    <Card className="rounded-xl border p-3 sm:p-4 space-y-1 min-w-0">
                      <span className="text-xs text-muted-foreground font-semibold block truncate">Total de Flats</span>
                      <div className="text-xl sm:text-2xl font-bold">{progressData.stats.total}</div>
                      <Progress value={progressData.stats.percentage} className="h-1.5 mt-2" />
                    </Card>

                    {/* Pendentes */}
                    <Card className="rounded-xl border p-3 sm:p-4 space-y-1 min-w-0">
                      <span className="text-xs text-muted-foreground font-semibold block truncate">Pendentes</span>
                      <div className="text-xl sm:text-2xl font-bold text-slate-700 dark:text-slate-300">
                        {progressData.stats.pending}
                      </div>
                      <span className="text-[11px] text-muted-foreground block truncate">Aguardando início</span>
                    </Card>

                    {/* Em Andamento */}
                    <Card className="rounded-xl border p-3 sm:p-4 space-y-1 min-w-0 bg-sky-500/5 border-sky-500/30">
                      <span className="text-xs text-sky-700 dark:text-sky-300 font-semibold flex items-center gap-1.5 truncate">
                        <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse shrink-0" />
                        <span className="truncate">Em Andamento</span>
                      </span>
                      <div className="text-xl sm:text-2xl font-bold text-sky-700 dark:text-sky-300">
                        {progressData.stats.inProgress}
                      </div>
                      <span className="text-[11px] text-sky-600 dark:text-sky-400 block truncate">Prestador no local</span>
                    </Card>

                    {/* Finalizados */}
                    <Card className="rounded-xl border p-3 sm:p-4 space-y-1 min-w-0 bg-emerald-500/5 border-emerald-500/30">
                      <span className="text-xs text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-1.5 truncate">
                        <Check className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">Finalizados</span>
                      </span>
                      <div className="text-xl sm:text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                        {progressData.stats.done}
                      </div>
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 block truncate">
                        {progressData.stats.percentage}% concluído
                      </span>
                    </Card>

                    {/* Prestador Identificado */}
                    <Card className="rounded-xl border p-3 sm:p-4 space-y-1.5 col-span-2 sm:col-span-4 lg:col-span-1 bg-muted/40 min-w-0">
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <span className="text-xs text-muted-foreground font-semibold flex items-center gap-1 truncate">
                          <Users className="w-3.5 h-3.5 text-primary shrink-0" />
                          <span className="truncate">Prestador Responsável</span>
                        </span>
                        {progressData.worker?.mainWorker?.name && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={deleteAdminWorkerMutation.isPending}
                            onClick={() => {
                              if (window.confirm("Deseja remover o prestador cadastrado e seus ajudantes desta ordem?")) {
                                deleteAdminWorkerMutation.mutate({ orderId: progressData.orderId });
                              }
                            }}
                            className="h-6 px-2 text-[10px] text-destructive hover:text-destructive hover:bg-destructive/10 rounded-md gap-1 shrink-0"
                            title="Remover prestador e ajudantes"
                          >
                            <Trash2 className="w-3 h-3" />
                            Remover
                          </Button>
                        )}
                      </div>
                      <div className="text-sm font-bold truncate">
                        {progressData.worker?.mainWorker?.name || "Ainda não identificado"}
                      </div>
                      <span className="text-[11px] text-muted-foreground truncate block">
                        {progressData.worker?.mainWorker?.cpf
                          ? `CPF: ${formatCpf(progressData.worker.mainWorker.cpf)}`
                          : "Aguardando cadastro no link"}
                        {progressData.worker?.mainWorker?.phone ? ` • Tel: ${progressData.worker.mainWorker.phone}` : ""}
                      </span>
                      {Array.isArray(progressData.worker?.collaborators) && progressData.worker.collaborators.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {progressData.worker.collaborators.map((c, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1 text-[10px] bg-background border px-1.5 py-0.5 rounded-md font-medium max-w-full"
                            >
                              <span className="truncate">👤 {c.name}</span>
                              <button
                                type="button"
                                disabled={deleteAdminWorkerMutation.isPending}
                                onClick={() => {
                                  if (window.confirm(`Remover o ajudante "${c.name}"?`)) {
                                    deleteAdminWorkerMutation.mutate({ orderId: progressData.orderId, collaboratorIndex: idx });
                                  }
                                }}
                                className="text-destructive hover:bg-destructive/15 rounded px-0.5 font-bold shrink-0"
                                title="Remover ajudante"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      {progressData.worker?.vehicle?.needsGarage && (
                        <div className="flex items-center justify-between gap-1 pt-1 min-w-0">
                          <span className="text-[11px] text-indigo-700 dark:text-indigo-300 font-semibold truncate">
                            🚗 Garagem: {progressData.worker.vehicle.plate || "Veículo"} {progressData.worker.vehicle.modelColor ? `(${progressData.worker.vehicle.modelColor})` : ""}
                          </span>
                          <button
                            type="button"
                            disabled={deleteAdminWorkerMutation.isPending}
                            onClick={() => {
                              if (window.confirm("Remover veículo/garagem do prestador?")) {
                                deleteAdminWorkerMutation.mutate({ orderId: progressData.orderId, clearVehicle: true });
                              }
                            }}
                            className="text-xs text-destructive hover:bg-destructive/15 rounded px-1 font-bold shrink-0"
                            title="Remover veículo"
                          >
                            ×
                          </button>
                        </div>
                      )}
                    </Card>
                  </div>

                  {/* Destinatários Configurados na Ordem */}
                  {Array.isArray(progressData.notificationRecipients) &&
                    progressData.notificationRecipients.filter((r) => Array.isArray(r.events) && r.events.length > 0).length > 0 && (
                      <div className="p-3 bg-muted/40 rounded-xl border text-xs flex items-center justify-between gap-2.5 flex-wrap min-w-0">
                        <div className="flex items-start sm:items-center gap-2 flex-wrap min-w-0 w-full">
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Bell className="w-4 h-4 text-primary shrink-0" />
                            <span className="font-bold text-foreground">Notificações configuradas:</span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                            {progressData.notificationRecipients
                              .filter((r) => Array.isArray(r.events) && r.events.length > 0)
                              .map((r, i) => (
                                <Badge key={i} variant="outline" className="text-[10px] bg-background rounded-md whitespace-normal break-words text-left leading-tight py-1 max-w-full">
                                  {r.name} ({r.phone}) [{r.events.map((e) => NOTIFICATION_EVENT_LABELS[e] || e).join(", ")}]
                                </Badge>
                              ))}
                          </div>
                        </div>
                      </div>
                  )}

                  {/* Filtro por Status da Tabela */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 min-w-0">
                    <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1 sm:gap-1.5 bg-muted p-1 rounded-xl w-full sm:w-auto">
                      <Button
                        variant={trackingStatusFilter === "all" ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setTrackingStatusFilter("all")}
                        className="h-8 text-[11px] sm:text-xs font-semibold px-2 sm:px-3 rounded-lg min-w-0"
                      >
                        <span className="truncate">Todos ({progressData.flats.length})</span>
                      </Button>
                      <Button
                        variant={trackingStatusFilter === "pending" ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setTrackingStatusFilter("pending")}
                        className="h-8 text-[11px] sm:text-xs font-semibold px-2 sm:px-3 rounded-lg min-w-0"
                      >
                        <span className="truncate">Pendentes ({progressData.stats.pending})</span>
                      </Button>
                      <Button
                        variant={trackingStatusFilter === "in_progress" ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setTrackingStatusFilter("in_progress")}
                        className="h-8 text-[11px] sm:text-xs font-semibold px-2 sm:px-3 rounded-lg text-sky-700 dark:text-sky-300 min-w-0"
                      >
                        <span className="truncate">Andamento ({progressData.stats.inProgress})</span>
                      </Button>
                      <Button
                        variant={trackingStatusFilter === "done" ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setTrackingStatusFilter("done")}
                        className="h-8 text-[11px] sm:text-xs font-semibold px-2 sm:px-3 rounded-lg text-emerald-700 dark:text-emerald-300 min-w-0"
                      >
                        <span className="truncate">Finalizados ({progressData.stats.done})</span>
                      </Button>
                    </div>

                    <span className="text-[11px] sm:text-xs text-muted-foreground">
                      Toque em qualquer apartamento para ver fotos e observações completas.
                    </span>
                  </div>

                  {/* ── VISÃO MOBILE (CARDS EMPILHADOS OTIMIZADOS PARA CELULAR) ── */}
                  <div className="md:hidden space-y-2.5 min-w-0">
                    {trackingFlats.length === 0 ? (
                      <div className="rounded-2xl border bg-card p-6 text-center text-muted-foreground text-xs">
                        Nenhum apartamento encontrado com o filtro selecionado.
                      </div>
                    ) : (
                      trackingFlats.map((flat) => {
                        const hasPhotos = Array.isArray(flat.photos) && flat.photos.length > 0;
                        const durationStr = formatDuration(flat.startedAt, flat.finishedAt);

                        return (
                          <div
                            key={flat.flatId}
                            onClick={() => setDetailModalFlat(flat)}
                            className="p-3.5 rounded-2xl border bg-card shadow-2xs space-y-2.5 active:scale-[0.99] transition-all cursor-pointer min-w-0"
                          >
                            {/* Linha 1: Flat + Status do Serviço */}
                            <div className="flex items-start justify-between gap-2 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                                <span className="font-black text-sm text-foreground">Flat {flat.flatNumber}</span>
                                {flat.operationalScenarioIcon && flat.operationalScenarioLabel && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] px-1.5 py-0 rounded-md font-medium inline-flex items-center gap-1"
                                  >
                                    <span>{flat.operationalScenarioIcon}</span>
                                    <span>{flat.operationalScenarioLabel}</span>
                                  </Badge>
                                )}
                                {flat.forceReleased ? (
                                  <Badge className="text-[9px] px-1.5 py-0 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-300 font-bold">
                                    🔓 Liberado
                                  </Badge>
                                ) : flat.isStatusAllowed === false ? (
                                  <Badge
                                    variant="destructive"
                                    className="text-[9px] px-1.5 py-0 rounded-md bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-300 font-bold"
                                  >
                                    🔒 Bloqueado
                                  </Badge>
                                ) : null}
                              </div>

                              <div className="shrink-0">
                                {flat.status === "pending" && (
                                  <Badge variant="secondary" className="text-[10px] font-semibold">
                                    Pendente
                                  </Badge>
                                )}
                                {flat.status === "in_progress" && (
                                  <Badge className="bg-sky-600 text-white text-[10px] font-semibold gap-1 animate-pulse">
                                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                                    Andamento
                                  </Badge>
                                )}
                                {flat.status === "done" && (
                                  <Badge className="bg-emerald-600 text-white text-[10px] font-semibold gap-1">
                                    <Check className="w-3 h-3 stroke-[3]" />
                                    Finalizado
                                  </Badge>
                                )}
                              </div>
                            </div>

                            {/* Linha 2: Chips de Ocupação / Limpeza / Entrada */}
                            <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                              {(flat as any).isOccupied ? (
                                <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800">
                                  🔴 Ocupado{(flat as any).currentGuest ? `: ${(flat as any).currentGuest.split(" ")[0]}` : ""}
                                </span>
                              ) : (flat as any).isDirty ? (
                                <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
                                  🧹 Sujo
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
                                  🟢 Vago / Limpo
                                </span>
                              )}
                              {flat.entryRequested && (
                                <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold bg-amber-50 text-amber-800 border border-amber-300">
                                  🔑 Entrada Solicitada
                                </span>
                              )}
                              {flat.needsCleaning === true && (
                                <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-bold bg-amber-500/15 text-amber-700 border border-amber-300">
                                  🧹 Chamar faxina
                                </span>
                              )}
                              {hasPhotos && (
                                <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold bg-primary/10 text-primary border border-primary/30">
                                  <Camera className="w-3 h-3" /> {flat.photos!.length} foto(s)
                                </span>
                              )}
                            </div>

                            {/* Linha 3: Resumo de Execução / Observações se houver */}
                            {(flat.workerName || flat.startedAt || flat.observations) && (
                              <div className="text-[11px] text-muted-foreground space-y-0.5 bg-muted/30 p-2 rounded-xl border border-border/50">
                                {flat.workerName && (
                                  <div className="truncate">
                                    👤 <strong className="text-foreground">{flat.workerName}</strong>
                                  </div>
                                )}
                                {flat.startedAt && (
                                  <div className="text-[10px]">
                                    🕒 Início: {formatDateTime(flat.startedAt)}
                                    {flat.finishedAt ? ` • Fim: ${formatDateTime(flat.finishedAt)}` : ""}
                                    {durationStr ? ` (${durationStr})` : ""}
                                  </div>
                                )}
                                {flat.observations && (
                                  <div className="text-[11px] text-foreground italic line-clamp-2">
                                    "{flat.observations}"
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Linha 4: Botões de Ação Rápida Mobile */}
                            <div
                              className="flex items-center justify-end gap-1.5 pt-1 border-t border-border/40"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {flat.status !== "done" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    adminCompleteFlatMutation.mutate({
                                      orderId: effectiveTrackingOrderId,
                                      flatId: flat.flatId,
                                    })
                                  }
                                  disabled={adminCompleteFlatMutation.isPending}
                                  className="h-8 px-2.5 text-xs text-emerald-700 border-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 font-semibold gap-1 flex-1"
                                >
                                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                                  <span>Concluir</span>
                                </Button>
                              )}

                              {flat.status === "pending" ? (
                                flat.forceReleased ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      forceReleaseMutation.mutate({
                                        orderId: effectiveTrackingOrderId,
                                        flatId: flat.flatId,
                                        forceReleased: false,
                                      })
                                    }
                                    disabled={forceReleaseMutation.isPending}
                                    className="h-8 px-2.5 text-xs text-amber-700 border-amber-300 gap-1 font-medium flex-1"
                                  >
                                    <Lock className="w-3.5 h-3.5" />
                                    <span>Bloquear</span>
                                  </Button>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      forceReleaseMutation.mutate({
                                        orderId: effectiveTrackingOrderId,
                                        flatId: flat.flatId,
                                        forceReleased: true,
                                      })
                                    }
                                    disabled={forceReleaseMutation.isPending}
                                    className="h-8 px-2.5 text-xs text-emerald-700 border-emerald-300 font-semibold gap-1 flex-1"
                                  >
                                    <span>🔓 Liberar</span>
                                  </Button>
                                )
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setResetConfirmFlat(flat)}
                                  className="h-8 px-2.5 text-xs text-muted-foreground hover:text-amber-600 gap-1"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  <span>Resetar</span>
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Tabela de Acompanhamento (Desktop) */}
                  <div className="hidden md:block rounded-2xl border bg-card overflow-x-auto max-w-full shadow-xs">
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="min-w-[220px] font-bold text-xs">Flat</TableHead>
                          <TableHead className="w-36 font-bold text-xs">Status</TableHead>
                          <TableHead className="font-bold text-xs">Prestador</TableHead>
                          <TableHead className="font-bold text-xs">Início</TableHead>
                          <TableHead className="font-bold text-xs">Fim / Duração</TableHead>
                          <TableHead className="w-36 font-bold text-xs">Precisa Camareira?</TableHead>
                          <TableHead className="font-bold text-xs">Observações</TableHead>
                          <TableHead className="w-24 font-bold text-xs text-center">Fotos</TableHead>
                          <TableHead className="w-36 min-w-[140px] font-bold text-xs text-right">Ação</TableHead>
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
                                <TableCell className="font-bold text-sm text-foreground min-w-[220px] align-top py-3">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="whitespace-nowrap">Flat {flat.flatNumber}</span>
                                    {flat.operationalScenarioIcon && flat.operationalScenarioLabel && (
                                      <Badge
                                        variant="outline"
                                        className="text-[10px] px-1.5 py-0.5 rounded-md font-medium whitespace-nowrap inline-flex items-center gap-1 shrink-0"
                                      >
                                        <span>{flat.operationalScenarioIcon}</span>
                                        <span>{flat.operationalScenarioLabel}</span>
                                      </Badge>
                                    )}
                                    {flat.forceReleased ? (
                                      <Badge className="text-[9px] px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 font-bold whitespace-nowrap inline-flex items-center gap-1 shrink-0">
                                        🔓 Liberado Manualmente
                                      </Badge>
                                    ) : flat.isStatusAllowed === false ? (
                                      <Badge
                                        variant="destructive"
                                        title={flat.statusBlockReason || "Status não autorizado para este serviço"}
                                        className="text-[9px] px-1.5 py-0.5 rounded-md bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-700 font-bold whitespace-nowrap inline-flex items-center gap-1 shrink-0"
                                      >
                                        🔒 Não Permitido
                                      </Badge>
                                    ) : null}
                                  </div>
                                  <div className="text-[10px] font-normal text-muted-foreground flex items-center gap-1.5 mt-1.5 flex-wrap">
                                    {(flat as any).isOccupied ? (
                                      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 font-medium bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800">
                                        🔴 Ocupado{(flat as any).currentGuest ? `: ${(flat as any).currentGuest}` : ""}
                                      </span>
                                    ) : (flat as any).isDirty ? (
                                      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 font-medium bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
                                        🧹 Sujo
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
                                        🟢 Vago / Limpo
                                      </span>
                                    )}
                                    {(flat as any).hasCheckinToday && (
                                      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 font-medium bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800">
                                        🔵 Chegada: {(flat as any).expectedArrival || "14:00"}
                                      </span>
                                    )}
                                    {flat.hasGuestInside && (
                                      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 font-semibold bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-950 dark:text-rose-200 dark:border-rose-700">
                                        ⚠️ Hóspede presente
                                      </span>
                                    )}
                                    {flat.entryRequested && flat.status === "pending" && (
                                      <Badge
                                        variant="outline"
                                        className="inline-flex items-center gap-1 whitespace-nowrap text-[9px] px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border-amber-300 font-medium shrink-0"
                                      >
                                        🔑 Entrada Solicitada
                                      </Badge>
                                    )}
                                  </div>
                                </TableCell>

                                {/* Status */}
                                <TableCell>
                                  {flat.status === "pending" && (
                                    <div className="space-y-1">
                                      <Badge variant="secondary" className="text-[11px] font-semibold">
                                        Pendente
                                      </Badge>
                                      {flat.entryRequested && (
                                        <span className="text-[10px] text-amber-700 block font-medium">
                                          🔑 Entrada solicitada
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  {flat.status === "in_progress" && (
                                    <div className="space-y-1">
                                      <Badge className="bg-sky-600 hover:bg-sky-600 text-white text-[11px] font-semibold gap-1.5 animate-pulse">
                                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                                        Em Andamento
                                      </Badge>
                                      {flat.estimatedFinishAt && (
                                        <span className={`text-[10px] block font-semibold ${new Date(flat.estimatedFinishAt).getTime() < Date.now() ? "text-rose-600 font-bold animate-pulse" : "text-sky-700 dark:text-sky-300"}`}>
                                          ⏱️ Previsão: {formatDateTime(flat.estimatedFinishAt)}
                                          {new Date(flat.estimatedFinishAt).getTime() < Date.now() && " (EXPIRADO)"}
                                        </span>
                                      )}
                                    </div>
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

                                {/* Ações */}
                                <TableCell className="text-right align-top py-3" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                    {flat.status !== "done" && (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() =>
                                              adminCompleteFlatMutation.mutate({
                                                orderId: effectiveTrackingOrderId,
                                                flatId: flat.flatId,
                                              })
                                            }
                                            disabled={adminCompleteFlatMutation.isPending}
                                            className="h-8 px-2 text-xs text-emerald-700 border-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 font-semibold gap-1"
                                          >
                                            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                                            <span>Concluir</span>
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Marcar este flat como concluído pelo Admin (atualiza o Raio-X)</TooltipContent>
                                      </Tooltip>
                                    )}
                                    {flat.status === "pending" ? (
                                      flat.forceReleased ? (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() =>
                                                forceReleaseMutation.mutate({
                                                  orderId: effectiveTrackingOrderId,
                                                  flatId: flat.flatId,
                                                  forceReleased: false,
                                                })
                                              }
                                              disabled={forceReleaseMutation.isPending}
                                              className="h-8 px-2 text-xs text-amber-700 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40 gap-1 font-medium"
                                            >
                                              <Lock className="w-3.5 h-3.5" />
                                              <span className="hidden sm:inline">Bloquear</span>
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>Revogar liberação manual (restaurar restrições)</TooltipContent>
                                        </Tooltip>
                                      ) : (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() =>
                                                forceReleaseMutation.mutate({
                                                  orderId: effectiveTrackingOrderId,
                                                  flatId: flat.flatId,
                                                  forceReleased: true,
                                                })
                                              }
                                              disabled={forceReleaseMutation.isPending}
                                              className="h-8 px-2 text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 font-semibold gap-1"
                                            >
                                              <span>🔓 Liberar</span>
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>Liberar flat independente de status ou regras de prioridade</TooltipContent>
                                        </Tooltip>
                                      )
                                    ) : (
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
                                    )}
                                  </div>
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
            <DialogContent className="w-[calc(100vw-1rem)] max-w-2xl max-h-[90dvh] overflow-x-hidden overflow-y-auto rounded-2xl p-4 sm:p-6">
              <DialogHeader className="border-b pb-3">
                <div className="flex items-center justify-between gap-3">
                  <DialogTitle className="text-xl font-bold flex items-center gap-2">
                    <Building className="w-5 h-5 text-primary" />
                    <span>Acompanhamento — Flat {detailModalFlat?.flatNumber}</span>
                    {detailModalFlat?.forceReleased && (
                      <Badge className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 font-bold whitespace-nowrap">
                        🔓 Liberado Manualmente
                      </Badge>
                    )}
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

              <DialogFooter className="border-t pt-3 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  {detailModalFlat && detailModalFlat.status !== "done" && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => {
                        adminCompleteFlatMutation.mutate({
                          orderId: effectiveTrackingOrderId,
                          flatId: detailModalFlat.flatId,
                        });
                      }}
                      disabled={adminCompleteFlatMutation.isPending}
                      className="text-xs gap-1.5 font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Marcar Concluído (Admin)
                    </Button>
                  )}

                  {detailModalFlat && detailModalFlat.status === "pending" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        forceReleaseMutation.mutate({
                          orderId: effectiveTrackingOrderId,
                          flatId: detailModalFlat.flatId,
                          forceReleased: !detailModalFlat.forceReleased,
                        });
                      }}
                      disabled={forceReleaseMutation.isPending}
                      className={`text-xs gap-1.5 font-semibold ${
                        detailModalFlat.forceReleased
                          ? "text-amber-700 border-amber-300 hover:bg-amber-50"
                          : "text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                      }`}
                    >
                      {detailModalFlat.forceReleased ? "🔒 Revogar Liberação Manual" : "🔓 Liberar Flat"}
                    </Button>
                  )}

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
                </div>

                <Button
                  variant="outline"
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
            <DialogContent className="w-[calc(100vw-1rem)] max-w-md rounded-2xl">
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
            <DialogContent className="w-[calc(100vw-1rem)] max-w-md rounded-2xl">
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
  );

  if (embedded) {
    return pageContent;
  }

  return <Shell>{pageContent}</Shell>;
}
