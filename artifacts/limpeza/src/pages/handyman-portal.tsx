import { useState, useMemo, useRef, useEffect } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { compressImage } from "@/lib/image-compression";
import {
  Wrench,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Camera,
  UserCheck,
  Sparkles,
  AlertCircle,
  Edit2,
  Loader2,
  X,
  Play,
  Check,
  ShieldCheck,
  Building,
  Car,
  KeyRound,
  Lock,
  DollarSign,
  Calendar,
  Search,
  Eye,
  Send,
} from "lucide-react";

export interface HandymanProfile {
  name: string;
  phone: string;
  cpf: string;
  needsGarage?: boolean;
  vehiclePlate?: string;
  vehicleModelColor?: string;
  portalToken: string;
}

export interface HandymanTicket {
  id: number;
  flatId: number;
  flatNumber: string;
  authorUsername?: string;
  category: string;
  specialty: string;
  specialtyLabel?: string;
  text: string;
  photos: string[];
  status: "aberta" | "resolvida";
  isRentalBlocker: boolean;
  assignedTo: "unassigned" | "admin" | "handyman";
  workflowStage:
    | "reported"
    | "awaiting_inspection"
    | "awaiting_quote"
    | "quote_submitted"
    | "approved_waiting_room"
    | "in_progress"
    | "resolvida";
  allowedRoomStatuses: string[];
  allowedScenarioLabels: string[];
  operationalScenario: string;
  operationalScenarioLabel: string;
  operationalScenarioIcon: string;
  scenarioWarning?: string | null;
  hasGuestInside?: boolean;
  isStatusAllowed: boolean;
  statusBlockReason?: string | null;
  forceReleased?: boolean;
  requireQuote?: boolean;
  quoteAmount?: number | null;
  quoteNotes?: string | null;
  quoteSubmittedAt?: string | null;
  quoteApproved?: boolean;
  quoteApprovedAt?: string | null;
  quoteRejectReason?: string | null;
  plannedStartAt?: string | null;
  estimatedFinishAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  wasCleanWhenStarted?: boolean | null;
  needsCleaningAfter?: boolean | null;
  completionPhotos?: string[];
  completionNotes?: string | null;
  adminNotes?: string | null;
  entryRequested?: boolean;
  entryRequestedAt?: string | null;
  paymentStatus?: "pending" | "paid";
  paidAt?: string | null;
  createdAt: string;
}

export interface HandymanPortalResponse {
  success: boolean;
  handyman: HandymanProfile;
  stats: {
    awaitingQuote: number;
    quoteSubmitted: number;
    readyToStart: number;
    inProgress: number;
    completed: number;
    pendingReceivable: number;
    totalPaid: number;
  };
  tickets: HandymanTicket[];
}

function formatCpfInput(val: string): string {
  const digits = val.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

function formatDateTime(isoStr?: string | null): string {
  if (!isoStr) return "-";
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoStr;
  }
}

function toLocalDatetimeInputValue(dateObj: Date): string {
  const local = new Date(dateObj.getTime() - dateObj.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export default function HandymanPortal({ params: propsParams }: { params?: { token?: string } }) {
  const [, matchManutencao] = useRoute("/manutencao/:token");
  const [, matchFazTudo] = useRoute("/faz-tudo/:token");
  const token = propsParams?.token || matchManutencao?.token || matchFazTudo?.token || "";

  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Filtro de aba
  const [filterTab, setFilterTab] = useState<"active" | "completed">("active");
  const [zoomPhotoUrl, setZoomPhotoUrl] = useState<string | null>(null);

  // Destaque via URL ?ticket=ID
  const highlightedTicketId = useMemo(() => {
    if (typeof window === "undefined") return null;
    const sp = new URLSearchParams(window.location.search);
    const t = sp.get("ticket");
    return t ? Number(t) : null;
  }, []);

  // Edição do Perfil do Faz-Tudo
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [workerName, setWorkerName] = useState("");
  const [workerPhone, setWorkerPhone] = useState("");
  const [workerCpf, setWorkerCpf] = useState("");
  const [needsGarage, setNeedsGarage] = useState(false);
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [vehicleModelColor, setVehicleModelColor] = useState("");

  // Modal de Envio de Orçamento (Valor + Quando vai iniciar + Prazo)
  const [quoteModalTicket, setQuoteModalTicket] = useState<HandymanTicket | null>(null);
  const [quoteAmountInput, setQuoteAmountInput] = useState("");
  const [quoteNotesInput, setQuoteNotesInput] = useState("");
  const [quotePlannedStartInput, setQuotePlannedStartInput] = useState("");
  const [quoteEstFinishInput, setQuoteEstFinishInput] = useState("");

  // Modal de Iniciar Serviço / Ajustar Prazo
  const [startModalTicket, setStartModalTicket] = useState<HandymanTicket | null>(null);
  const [startEstFinishInput, setStartEstFinishInput] = useState("");

  // Modal de Alterar Agendamento / Prazo
  const [scheduleModalTicket, setScheduleModalTicket] = useState<HandymanTicket | null>(null);
  const [schedStartInput, setSchedStartInput] = useState("");
  const [schedFinishInput, setSchedFinishInput] = useState("");
  const [schedNotesInput, setSchedNotesInput] = useState("");

  // Modal de Concluir Serviço
  const [finishModalTicket, setFinishModalTicket] = useState<HandymanTicket | null>(null);
  const [needsCleaningChoice, setNeedsCleaningChoice] = useState<"yes" | "no" | null>(null);
  const [finishNotesInput, setFinishNotesInput] = useState("");
  const [finishPhotos, setFinishPhotos] = useState<string[]>([]);
  const [isCompressingPhotos, setIsCompressingPhotos] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, isError, error } = useQuery<HandymanPortalResponse>({
    queryKey: ["handyman-portal", token],
    queryFn: async () => {
      const res = await fetch(`/api/handyman/public/${token}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Link do Portal do Faz-Tudo inválido ou expirado.");
      }
      return res.json();
    },
    enabled: Boolean(token),
    refetchInterval: 10000,
  });

  const handyman = data?.handyman;
  const tickets = data?.tickets || [];
  const stats = data?.stats;

  useEffect(() => {
    if (handyman && !editProfileOpen) {
      setWorkerName(handyman.name || "");
      setWorkerPhone(handyman.phone || "");
      setWorkerCpf(formatCpfInput(handyman.cpf || ""));
      setNeedsGarage(Boolean(handyman.needsGarage));
      setVehiclePlate(handyman.vehiclePlate || "");
      setVehicleModelColor(handyman.vehicleModelColor || "");
    }
  }, [handyman, editProfileOpen]);

  // Mutation: Salvar Perfil
  const saveProfileMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/handyman/public/${token}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: workerName.trim(),
          phone: workerPhone.replace(/\D/g, ""),
          cpf: workerCpf.replace(/\D/g, ""),
          needsGarage,
          vehiclePlate: vehiclePlate.trim().toUpperCase(),
          vehicleModelColor: vehicleModelColor.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erro ao salvar perfil.");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Seus dados foram salvos!",
        description: "Você receberá avisos no WhatsApp sempre que um apartamento liberar.",
      });
      setEditProfileOpen(false);
      queryClient.invalidateQueries({ queryKey: ["handyman-portal", token] });
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  // Mutation: Solicitar Vistoria Prévia antes de Orçar
  const requestInspectionMutation = useMutation({
    mutationFn: async (ticketId: number) => {
      const res = await fetch(`/api/handyman/public/${token}/tickets/${ticketId}/request-inspection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erro ao solicitar vistoria.");
      }
      return res.json();
    },
    onSuccess: (resData: any) => {
      toast({
        title: "🔍 Pedido de Vistoria Registrado!",
        description: resData.message || "O administrador foi avisado.",
      });
      queryClient.invalidateQueries({ queryKey: ["handyman-portal", token] });
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  // Mutation: Enviar Orçamento (Valor + Início + Prazo)
  const submitQuoteMutation = useMutation({
    mutationFn: async () => {
      if (!quoteModalTicket) return;
      const numericVal = Number(String(quoteAmountInput).replace(",", "."));
      if (!quoteAmountInput || isNaN(numericVal) || numericVal < 0) {
        throw new Error("Informe o valor do serviço em R$.");
      }
      const res = await fetch(`/api/handyman/public/${token}/tickets/${quoteModalTicket.id}/submit-quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteAmount: numericVal,
          quoteNotes: quoteNotesInput.trim(),
          plannedStartAt: quotePlannedStartInput ? new Date(quotePlannedStartInput).toISOString() : null,
          estimatedFinishAt: quoteEstFinishInput ? new Date(quoteEstFinishInput).toISOString() : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erro ao enviar orçamento.");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "💰 Orçamento enviado para aprovação!",
        description: "O Miller recebeu sua proposta no WhatsApp. Assim que ele aprovar, você será avisado.",
      });
      setQuoteModalTicket(null);
      queryClient.invalidateQueries({ queryKey: ["handyman-portal", token] });
    },
    onError: (err: any) => {
      toast({ title: "Atenção", description: err.message, variant: "destructive" });
    },
  });

  // Mutation: Solicitar Entrada na Portaria
  const requestEntryMutation = useMutation({
    mutationFn: async (ticketId: number) => {
      const res = await fetch(`/api/handyman/public/${token}/tickets/${ticketId}/request-entry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Não foi possível solicitar entrada.");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "🔑 Portaria / Recepção notificada!",
        description: "A recepção recebeu seu pedido de entrada no apartamento.",
      });
      queryClient.invalidateQueries({ queryKey: ["handyman-portal", token] });
    },
    onError: (err: any) => {
      toast({ title: "Acesso bloqueado no momento", description: err.message, variant: "destructive" });
    },
  });

  // Mutation: Iniciar Serviço
  const startTicketMutation = useMutation({
    mutationFn: async () => {
      if (!startModalTicket) return;
      if (!startEstFinishInput) {
        throw new Error("Informe a previsão de término para bloquear o calendário até você concluir.");
      }
      const res = await fetch(`/api/handyman/public/${token}/tickets/${startModalTicket.id}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estimatedFinishAt: new Date(startEstFinishInput).toISOString(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erro ao iniciar serviço.");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "▶️ Serviço Iniciado!",
        description: "O apartamento está em manutenção e a administração foi avisada.",
      });
      setStartModalTicket(null);
      queryClient.invalidateQueries({ queryKey: ["handyman-portal", token] });
    },
    onError: (err: any) => {
      toast({ title: "Não foi possível iniciar", description: err.message, variant: "destructive" });
    },
  });

  // Mutation: Atualizar Agendamento / Prazo
  const updateScheduleMutation = useMutation({
    mutationFn: async () => {
      if (!scheduleModalTicket) return;
      const res = await fetch(`/api/handyman/public/${token}/tickets/${scheduleModalTicket.id}/update-schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plannedStartAt: schedStartInput ? new Date(schedStartInput).toISOString() : null,
          estimatedFinishAt: schedFinishInput ? new Date(schedFinishInput).toISOString() : null,
          notes: schedNotesInput.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erro ao salvar agendamento/prazo.");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "🗓️ Prazo / Agendamento atualizado!",
        description: "O calendário do apartamento e o administrador foram atualizados.",
      });
      setScheduleModalTicket(null);
      queryClient.invalidateQueries({ queryKey: ["handyman-portal", token] });
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  // Mutation: Concluir Serviço
  const finishTicketMutation = useMutation({
    mutationFn: async () => {
      if (!finishModalTicket) return;
      if (finishModalTicket.wasCleanWhenStarted && needsCleaningChoice === null) {
        throw new Error("Informe se o apartamento precisa de limpeza/conferência da camareira.");
      }
      const res = await fetch(`/api/handyman/public/${token}/tickets/${finishModalTicket.id}/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          needsCleaning: finishModalTicket.wasCleanWhenStarted ? needsCleaningChoice === "yes" : false,
          observations: finishNotesInput.trim(),
          photos: finishPhotos,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erro ao finalizar serviço.");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "🏁 Reparo Concluído com Sucesso!",
        description: "O apartamento foi liberado no calendário e o valor entrou no seu extrato a receber.",
      });
      setFinishModalTicket(null);
      setNeedsCleaningChoice(null);
      setFinishNotesInput("");
      setFinishPhotos([]);
      queryClient.invalidateQueries({ queryKey: ["handyman-portal", token] });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao concluir", description: err.message, variant: "destructive" });
    },
  });

  const handleOpenQuoteModal = (ticket: HandymanTicket) => {
    setQuoteModalTicket(ticket);
    setQuoteAmountInput(ticket.quoteAmount !== null && ticket.quoteAmount !== undefined ? String(ticket.quoteAmount) : "");
    setQuoteNotesInput(ticket.quoteNotes || "");
    const now = new Date();
    const defStart = ticket.plannedStartAt ? new Date(ticket.plannedStartAt) : now;
    const defEnd = ticket.estimatedFinishAt
      ? new Date(ticket.estimatedFinishAt)
      : new Date(now.getTime() + 2 * 3600 * 1000);
    setQuotePlannedStartInput(toLocalDatetimeInputValue(defStart));
    setQuoteEstFinishInput(toLocalDatetimeInputValue(defEnd));
  };

  const handleOpenStartModal = (ticket: HandymanTicket) => {
    setStartModalTicket(ticket);
    const now = new Date();
    const defEnd = ticket.estimatedFinishAt && new Date(ticket.estimatedFinishAt).getTime() > now.getTime()
      ? new Date(ticket.estimatedFinishAt)
      : new Date(now.getTime() + 2 * 3600 * 1000);
    setStartEstFinishInput(toLocalDatetimeInputValue(defEnd));
  };

  const handleOpenScheduleModal = (ticket: HandymanTicket) => {
    setScheduleModalTicket(ticket);
    const now = new Date();
    setSchedStartInput(
      ticket.plannedStartAt ? toLocalDatetimeInputValue(new Date(ticket.plannedStartAt)) : toLocalDatetimeInputValue(now)
    );
    setSchedFinishInput(
      ticket.estimatedFinishAt
        ? toLocalDatetimeInputValue(new Date(ticket.estimatedFinishAt))
        : toLocalDatetimeInputValue(new Date(now.getTime() + 3 * 3600 * 1000))
    );
    setSchedNotesInput("");
  };

  const handleOpenFinishModal = (ticket: HandymanTicket) => {
    setFinishModalTicket(ticket);
    setNeedsCleaningChoice(null);
    setFinishNotesInput("");
    setFinishPhotos([]);
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setIsCompressingPhotos(true);
    try {
      const results: string[] = [];
      for (const file of files) {
        const comp = await compressImage(file, 1280, 0.78);
        results.push(comp.base64);
      }
      setFinishPhotos((prev) => [...prev, ...results]);
    } catch {
      toast({ title: "Erro ao processar foto", variant: "destructive" });
    } finally {
      setIsCompressingPhotos(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const activeTickets = useMemo(() => {
    const list = tickets.filter((t) => t.status !== "resolvida");
    if (highlightedTicketId) {
      return [...list].sort((a, b) => (a.id === highlightedTicketId ? -1 : b.id === highlightedTicketId ? 1 : 0));
    }
    return list;
  }, [tickets, highlightedTicketId]);

  const completedTickets = useMemo(() => tickets.filter((t) => t.status === "resolvida"), [tickets]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <Loader2 className="w-10 h-10 text-amber-500 animate-spin mb-3" />
        <h2 className="text-base font-black text-foreground">Carregando Painel de Manutenções...</h2>
      </div>
    );
  }

  if (isError || !handyman) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <AlertTriangle className="w-12 h-12 text-rose-500 mb-3" />
        <h2 className="text-lg font-black text-foreground">Link Inválido ou Expirado</h2>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm">
          {(error as any)?.message || "Solicite um novo link ao administrador do CorpFlats."}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-20">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 bg-slate-900 text-white px-4 py-3.5 shadow-md">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0 font-black">
              <Wrench className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-amber-400 block">
                CorpFlats • Portal do Faz-Tudo
              </span>
              <h1 className="text-sm sm:text-base font-black truncate">{handyman.name}</h1>
            </div>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setEditProfileOpen(true)}
            className="h-8 text-xs font-bold rounded-xl border-slate-700 bg-slate-800 text-white hover:bg-slate-700 shrink-0 gap-1.5"
          >
            <Edit2 className="w-3.5 h-3.5" />
            <span>Meus Dados / Garagem</span>
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-3.5 sm:p-5 space-y-4">
        {/* Resumo Rápido & Valores a Receber */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <Card className="rounded-2xl border-amber-500/30 bg-amber-500/10 p-3">
            <span className="text-[10px] uppercase font-bold text-amber-800 dark:text-amber-300 block">
              Orçar / Vistoriar
            </span>
            <span className="text-xl font-black text-amber-900 dark:text-amber-200">
              {stats?.awaitingQuote || 0}
            </span>
          </Card>

          <Card className="rounded-2xl border-emerald-500/30 bg-emerald-500/10 p-3">
            <span className="text-[10px] uppercase font-bold text-emerald-800 dark:text-emerald-300 block">
              Aprovados / Iniciar
            </span>
            <span className="text-xl font-black text-emerald-900 dark:text-emerald-200">
              {(stats?.readyToStart || 0) + (stats?.inProgress || 0)}
            </span>
          </Card>

          <Card className="rounded-2xl border-sky-500/30 bg-sky-500/10 p-3">
            <span className="text-[10px] uppercase font-bold text-sky-800 dark:text-sky-300 block">
              A Receber (R$)
            </span>
            <span className="text-lg font-black text-sky-900 dark:text-sky-200">
              R$ {Number(stats?.pendingReceivable || 0).toFixed(2)}
            </span>
          </Card>

          <Card className="rounded-2xl border-border bg-card p-3">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">
              Já Recebido
            </span>
            <span className="text-lg font-black text-foreground">
              R$ {Number(stats?.totalPaid || 0).toFixed(2)}
            </span>
          </Card>
        </div>

        {/* Alternador de Abas: Em Aberto vs. Concluídos */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-2xl">
          <button
            type="button"
            onClick={() => setFilterTab("active")}
            className={`py-2.5 px-3 rounded-xl text-xs font-black transition-all ${
              filterTab === "active"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            🛠️ Demandas Ativas ({activeTickets.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("completed")}
            className={`py-2.5 px-3 rounded-xl text-xs font-black transition-all ${
              filterTab === "completed"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            ✅ Concluídas & Pagamentos ({completedTickets.length})
          </button>
        </div>

        {/* Lista de Cards Ativos */}
        {filterTab === "active" && (
          <div className="space-y-3.5">
            {activeTickets.length === 0 ? (
              <Card className="rounded-3xl border border-dashed p-10 text-center">
                <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500/50 mb-2" />
                <h3 className="text-sm font-black text-foreground">Nenhuma demanda pendente!</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Todas as solicitações atribuídas a você foram concluídas.
                </p>
              </Card>
            ) : (
              activeTickets.map((ticket) => {
                const isHighlighted = highlightedTicketId === ticket.id;
                const stage = ticket.workflowStage;
                const needsQuote =
                  (stage === "awaiting_quote" || stage === "awaiting_inspection") && !ticket.quoteApproved;
                const waitingApproval = stage === "quote_submitted" && !ticket.quoteApproved;
                const isApproved = Boolean(ticket.quoteApproved) && stage === "approved_waiting_room";
                const isInProgress = stage === "in_progress";

                return (
                  <Card
                    key={ticket.id}
                    className={`rounded-3xl border-2 overflow-hidden transition-all shadow-xs ${
                      isHighlighted
                        ? "border-amber-500 ring-2 ring-amber-500/20"
                        : isInProgress
                        ? "border-sky-500/70 bg-sky-500/5"
                        : isApproved && ticket.isStatusAllowed
                        ? "border-emerald-500/70"
                        : "border-border"
                    }`}
                  >
                    <CardHeader className="p-4 pb-3 border-b bg-muted/20">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="px-3 py-1 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-black text-sm">
                            Flat {ticket.flatNumber}
                          </span>
                          <Badge variant="outline" className="text-xs font-bold">
                            {ticket.specialtyLabel || "🔧 Manutenção"}
                          </Badge>
                          {ticket.isRentalBlocker && (
                            <Badge className="bg-rose-600 text-white text-[10px] font-bold">
                              🚫 Urgente / Flat Bloqueado
                            </Badge>
                          )}
                        </div>

                        {/* Badge do Estágio */}
                        <div>
                          {needsQuote && (
                            <Badge className="bg-amber-500 text-white text-[11px] font-bold">
                              {stage === "awaiting_inspection"
                                ? "🔍 Aguardando Sua Vistoria / Orçamento"
                                : "💰 Informe o Valor e Prazo"}
                            </Badge>
                          )}
                          {waitingApproval && (
                            <Badge className="bg-purple-600 text-white text-[11px] font-bold">
                              ⏳ Orçamento Enviado (R$ {Number(ticket.quoteAmount || 0).toFixed(2)})
                            </Badge>
                          )}
                          {isApproved && (
                            <Badge
                              className={`text-white text-[11px] font-bold ${
                                ticket.isStatusAllowed ? "bg-emerald-600" : "bg-slate-600"
                              }`}
                            >
                              {ticket.isStatusAllowed
                                ? "✅ Aprovado & Quarto Liberado"
                                : "🔒 Aprovado (Aguardando Quarto Liberar)"}
                            </Badge>
                          )}
                          {isInProgress && (
                            <Badge className="bg-sky-600 text-white text-[11px] font-bold animate-pulse">
                              ▶️ Serviço em Andamento
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="p-4 space-y-3.5">
                      {/* Descrição do Problema */}
                      <div className="p-3 rounded-2xl bg-muted/40 border space-y-1">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                          Problema Relatado ({ticket.authorUsername || "Equipe"}):
                        </span>
                        <p className="text-sm font-bold text-foreground leading-relaxed">{ticket.text}</p>
                        {ticket.adminNotes && (
                          <p className="text-xs text-amber-700 dark:text-amber-300 font-semibold pt-1">
                            📌 Instrução do Miller: "{ticket.adminNotes}"
                          </p>
                        )}
                        {ticket.quoteRejectReason && (
                          <p className="text-xs text-rose-600 font-bold pt-1">
                            🔄 Pedido de revisão: "{ticket.quoteRejectReason}"
                          </p>
                        )}
                      </div>

                      {/* Fotos do Problema */}
                      {ticket.photos && ticket.photos.length > 0 && (
                        <div className="space-y-1.5">
                          <span className="text-[11px] font-bold text-muted-foreground block">
                            📷 Fotos do Problema ({ticket.photos.length}):
                          </span>
                          <div className="flex items-center gap-2 overflow-x-auto pb-1">
                            {ticket.photos.map((url, idx) => (
                              <img
                                key={idx}
                                src={url}
                                alt={`Foto ${idx + 1}`}
                                onClick={() => setZoomPhotoUrl(url)}
                                className="w-20 h-20 rounded-xl object-cover border cursor-pointer hover:opacity-90 shrink-0"
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Status Ao Vivo do Flat vs. Filtros Permitidos */}
                      <div
                        className={`p-3 rounded-2xl border text-xs space-y-1.5 ${
                          ticket.isStatusAllowed
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-200"
                            : "bg-amber-500/10 border-amber-500/30 text-amber-950 dark:text-amber-200"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="font-black flex items-center gap-1.5">
                            <span>Situação do Flat Agora:</span>
                            <span>
                              {ticket.operationalScenarioIcon} {ticket.operationalScenarioLabel}
                            </span>
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] font-bold ${
                              ticket.isStatusAllowed
                                ? "border-emerald-600 text-emerald-700 dark:text-emerald-300"
                                : "border-amber-600 text-amber-800 dark:text-amber-300"
                            }`}
                          >
                            {ticket.isStatusAllowed ? "🔓 Entrada Permitida" : "🔒 Entrada Bloqueada Agora"}
                          </Badge>
                        </div>

                        {!ticket.isStatusAllowed && ticket.statusBlockReason && (
                          <div className="text-[11px] leading-snug space-y-1 pt-0.5">
                            <p className="font-semibold text-rose-700 dark:text-rose-300">
                              ⚠️ Motivo: {ticket.statusBlockReason}
                            </p>
                            <p className="text-muted-foreground">
                              📲 <strong>Fique tranquilo:</strong> Você receberá um WhatsApp automático assim que este flat entrar na situação liberada!
                            </p>
                          </div>
                        )}

                        {ticket.isStatusAllowed && ticket.scenarioWarning && (
                          <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                            {ticket.scenarioWarning}
                          </p>
                        )}
                      </div>

                      {/* Resumo de Valor e Prazos se já preenchidos */}
                      {(ticket.quoteAmount !== null && ticket.quoteAmount !== undefined) ||
                      ticket.plannedStartAt ||
                      ticket.estimatedFinishAt ? (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-2.5 rounded-2xl bg-background border text-xs">
                          {ticket.quoteAmount !== null && ticket.quoteAmount !== undefined && (
                            <div>
                              <span className="text-[10px] text-muted-foreground block">Valor do Serviço:</span>
                              <span className="font-black text-emerald-600">
                                R$ {Number(ticket.quoteAmount).toFixed(2)}{" "}
                                {ticket.quoteApproved ? "(Aprovado)" : "(Em análise)"}
                              </span>
                            </div>
                          )}
                          {ticket.plannedStartAt && (
                            <div>
                              <span className="text-[10px] text-muted-foreground block">Previsão de Início:</span>
                              <span className="font-bold">{formatDateTime(ticket.plannedStartAt)}</span>
                            </div>
                          )}
                          {ticket.estimatedFinishAt && (
                            <div>
                              <span className="text-[10px] text-muted-foreground block">Prazo de Conclusão:</span>
                              <span className="font-bold">{formatDateTime(ticket.estimatedFinishAt)}</span>
                            </div>
                          )}
                        </div>
                      ) : null}
                    </CardContent>

                    <CardFooter className="p-4 pt-3 bg-muted/20 border-t flex flex-wrap items-center justify-between gap-2">
                      {/* AÇÕES QUANDO PRECISA ENVIAR ORÇAMENTO */}
                      {needsQuote && (
                        <div className="w-full flex flex-col sm:flex-row gap-2">
                          <Button
                            onClick={() => handleOpenQuoteModal(ticket)}
                            className="flex-1 h-10 rounded-xl text-xs font-black gap-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950"
                          >
                            <DollarSign className="w-4 h-4" />
                            <span>Informar Valor (R$), Início e Prazo</span>
                          </Button>

                          {stage !== "awaiting_inspection" ? (
                            <Button
                              variant="outline"
                              onClick={() => requestInspectionMutation.mutate(ticket.id)}
                              disabled={requestInspectionMutation.isPending}
                              className="h-10 rounded-xl text-xs font-bold gap-1.5"
                            >
                              <Eye className="w-4 h-4" />
                              <span>Preciso Vistoriar o Flat Antes de Orçar</span>
                            </Button>
                          ) : (
                            ticket.isStatusAllowed && (
                              <Button
                                variant="outline"
                                onClick={() => requestEntryMutation.mutate(ticket.id)}
                                disabled={requestEntryMutation.isPending}
                                className="h-10 rounded-xl text-xs font-bold gap-1.5 border-emerald-500 text-emerald-700"
                              >
                                <KeyRound className="w-4 h-4" />
                                <span>Avisar Portaria para Vistoriar Agora</span>
                              </Button>
                            )
                          )}
                        </div>
                      )}

                      {/* AÇÕES QUANDO ORÇAMENTO ESTÁ AGUARDANDO APROVAÇÃO DO MILLER */}
                      {waitingApproval && (
                        <div className="w-full flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-xs text-muted-foreground font-medium">
                            ⏳ Aguardando aprovação do Miller para liberar o início...
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenQuoteModal(ticket)}
                            className="h-9 rounded-xl text-xs font-bold gap-1"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>Alterar Valor / Prazo</span>
                          </Button>
                        </div>
                      )}

                      {/* AÇÕES QUANDO APROVADO E AGUARDANDO INICIAR */}
                      {isApproved && (
                        <div className="w-full flex flex-col sm:flex-row gap-2">
                          <Button
                            onClick={() => handleOpenStartModal(ticket)}
                            disabled={!ticket.isStatusAllowed}
                            className="flex-1 h-10 rounded-xl text-xs font-black gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                          >
                            <Play className="w-4 h-4" />
                            <span>
                              {ticket.isStatusAllowed
                                ? "▶️ Iniciar Serviço Agora"
                                : "🔒 Aguardando Liberação do Quarto"}
                            </span>
                          </Button>

                          {ticket.isStatusAllowed && (
                            <Button
                              variant="outline"
                              onClick={() => requestEntryMutation.mutate(ticket.id)}
                              disabled={requestEntryMutation.isPending}
                              className="h-10 rounded-xl text-xs font-bold gap-1.5"
                            >
                              <KeyRound className="w-4 h-4" />
                              <span>Pedir Entrada na Portaria</span>
                            </Button>
                          )}

                          <Button
                            variant="outline"
                            onClick={() => handleOpenScheduleModal(ticket)}
                            className="h-10 rounded-xl text-xs font-bold gap-1.5"
                          >
                            <Calendar className="w-4 h-4" />
                            <span>Agendar Início / Alterar Prazo</span>
                          </Button>
                        </div>
                      )}

                      {/* AÇÕES QUANDO EM ANDAMENTO */}
                      {isInProgress && (
                        <div className="w-full flex flex-col sm:flex-row gap-2">
                          <Button
                            onClick={() => handleOpenFinishModal(ticket)}
                            className="flex-1 h-10 rounded-xl text-xs font-black gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>🏁 Concluir Serviço</span>
                          </Button>

                          <Button
                            variant="outline"
                            onClick={() => handleOpenScheduleModal(ticket)}
                            className="h-10 rounded-xl text-xs font-bold gap-1.5"
                          >
                            <Clock className="w-4 h-4" />
                            <span>Alterar Prazo de Término</span>
                          </Button>
                        </div>
                      )}
                    </CardFooter>
                  </Card>
                );
              })
            )}
          </div>
        )}

        {/* Lista de Cards Concluídos */}
        {filterTab === "completed" && (
          <div className="space-y-3">
            {completedTickets.length === 0 ? (
              <Card className="rounded-3xl border border-dashed p-10 text-center">
                <p className="text-xs text-muted-foreground">Nenhum serviço concluído ainda.</p>
              </Card>
            ) : (
              completedTickets.map((ticket) => (
                <Card key={ticket.id} className="rounded-2xl border p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-slate-800 text-white font-bold">Flat {ticket.flatNumber}</Badge>
                      <span className="text-xs font-bold text-foreground">{ticket.text}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {ticket.quoteAmount !== null && ticket.quoteAmount !== undefined && (
                        <span className="text-xs font-black text-foreground">
                          R$ {Number(ticket.quoteAmount).toFixed(2)}
                        </span>
                      )}
                      {ticket.paymentStatus === "paid" ? (
                        <Badge className="bg-emerald-600 text-white text-[10px] font-bold">✓ Pago</Badge>
                      ) : (
                        <Badge className="bg-amber-500 text-white text-[10px] font-bold">⏳ A Receber</Badge>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Concluído em {formatDateTime(ticket.finishedAt)}
                    {ticket.completionNotes ? ` • Obs: "${ticket.completionNotes}"` : ""}
                  </p>
                </Card>
              ))
            )}
          </div>
        )}
      </main>

      {/* Modal: Informar Orçamento (Valor + Quando vai iniciar + Prazo) */}
      <Dialog open={Boolean(quoteModalTicket)} onOpenChange={(o) => !o && setQuoteModalTicket(null)}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-base font-black flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-amber-500" />
              <span>Orçamento & Prazo — Flat {quoteModalTicket?.flatNumber}</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Informe o valor do serviço e a sua previsão de início e término para aprovação do administrador.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2 text-xs">
            <div className="space-y-1">
              <Label className="text-xs font-bold">Valor do Serviço (R$) *</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="Ex: 120.00"
                value={quoteAmountInput}
                onChange={(e) => setQuoteAmountInput(e.target.value)}
                className="h-10 text-sm font-black rounded-xl"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold">Quando você poderá iniciar o serviço? *</Label>
              <Input
                type="datetime-local"
                value={quotePlannedStartInput}
                onChange={(e) => setQuotePlannedStartInput(e.target.value)}
                className="h-10 text-xs rounded-xl"
              />
              <span className="text-[10px] text-muted-foreground block">
                Se não puder fazer hoje, coloque o dia e hora em que irá iniciar.
              </span>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold">Previsão de Conclusão (Prazo Final) *</Label>
              <Input
                type="datetime-local"
                value={quoteEstFinishInput}
                onChange={(e) => setQuoteEstFinishInput(e.target.value)}
                className="h-10 text-xs rounded-xl"
              />
              <span className="text-[10px] text-muted-foreground block">
                O calendário do apartamento respeitará este prazo até o reparo ser concluído.
              </span>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold">Observações / Materiais Necessários (Opcional)</Label>
              <Textarea
                rows={2}
                placeholder="Ex: Inclui troca do reparo do registro, peça já em mãos..."
                value={quoteNotesInput}
                onChange={(e) => setQuoteNotesInput(e.target.value)}
                className="text-xs rounded-xl"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setQuoteModalTicket(null)} className="rounded-xl text-xs">
              Cancelar
            </Button>
            <Button
              onClick={() => submitQuoteMutation.mutate()}
              disabled={submitQuoteMutation.isPending}
              className="rounded-xl text-xs font-black bg-amber-500 hover:bg-amber-600 text-slate-950 gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{submitQuoteMutation.isPending ? "Enviando..." : "Enviar Orçamento para Aprovação"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Iniciar Serviço */}
      <Dialog open={Boolean(startModalTicket)} onOpenChange={(o) => !o && setStartModalTicket(null)}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-base font-black flex items-center gap-2">
              <Play className="w-5 h-5 text-emerald-600" />
              <span>Iniciar Reparo — Flat {startModalTicket?.flatNumber}</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Confirme o prazo estimado de término. O calendário do flat ficará protegido até você finalizar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <Label className="text-xs font-bold">Previsão de Término (Data e Hora) *</Label>
              <Input
                type="datetime-local"
                value={startEstFinishInput}
                onChange={(e) => setStartEstFinishInput(e.target.value)}
                className="h-10 text-xs rounded-xl"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setStartModalTicket(null)} className="rounded-xl text-xs">
              Cancelar
            </Button>
            <Button
              onClick={() => startTicketMutation.mutate()}
              disabled={startTicketMutation.isPending}
              className="rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {startTicketMutation.isPending ? "Iniciando..." : "▶️ Confirmar Início Agora"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Agendar Início / Alterar Prazo */}
      <Dialog open={Boolean(scheduleModalTicket)} onOpenChange={(o) => !o && setScheduleModalTicket(null)}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-base font-black flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              <span>Programar Início & Prazo — Flat {scheduleModalTicket?.flatNumber}</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Caso não possa executar hoje ou precise estender o prazo, atualize abaixo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <Label className="text-xs font-bold">Quando irá iniciar o serviço?</Label>
              <Input
                type="datetime-local"
                value={schedStartInput}
                onChange={(e) => setSchedStartInput(e.target.value)}
                className="h-10 text-xs rounded-xl"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold">Nova Previsão de Conclusão (Prazo Final)</Label>
              <Input
                type="datetime-local"
                value={schedFinishInput}
                onChange={(e) => setSchedFinishInput(e.target.value)}
                className="h-10 text-xs rounded-xl"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold">Motivo / Observação (Opcional)</Label>
              <Input
                placeholder="Ex: Aguardando secagem da cola / peça chega amanhã cedo"
                value={schedNotesInput}
                onChange={(e) => setSchedNotesInput(e.target.value)}
                className="h-9 text-xs rounded-xl"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setScheduleModalTicket(null)} className="rounded-xl text-xs">
              Cancelar
            </Button>
            <Button
              onClick={() => updateScheduleMutation.mutate()}
              disabled={updateScheduleMutation.isPending}
              className="rounded-xl text-xs font-bold"
            >
              {updateScheduleMutation.isPending ? "Salvando..." : "Salvar Prazo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Concluir Serviço */}
      <Dialog open={Boolean(finishModalTicket)} onOpenChange={(o) => !o && setFinishModalTicket(null)}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-base font-black flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <span>Concluir Reparo — Flat {finishModalTicket?.flatNumber}</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Registre a finalização para liberar o apartamento no calendário.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            {finishModalTicket?.wasCleanWhenStarted && (
              <div className="p-3.5 rounded-2xl border-2 border-amber-400/70 bg-amber-500/10 space-y-2">
                <Label className="text-xs font-black text-amber-950 dark:text-amber-200 block">
                  🧹 Este flat estava LIMPO antes do reparo. Ele precisa de limpeza da camareira agora? *
                </Label>
                <RadioGroup
                  value={needsCleaningChoice || ""}
                  onValueChange={(v) => setNeedsCleaningChoice(v as "yes" | "no")}
                  className="grid grid-cols-2 gap-2 pt-1"
                >
                  <label className="flex items-center gap-2 p-2.5 rounded-xl border bg-background cursor-pointer font-bold">
                    <RadioGroupItem value="yes" />
                    <span>Sim, precisa limpar</span>
                  </label>
                  <label className="flex items-center gap-2 p-2.5 rounded-xl border bg-background cursor-pointer font-bold">
                    <RadioGroupItem value="no" />
                    <span>Não, continuou limpo</span>
                  </label>
                </RadioGroup>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs font-bold">O que foi feito / Observações de Conclusão</Label>
              <Textarea
                rows={2}
                placeholder="Ex: Registro substituído e testado sem vazamentos..."
                value={finishNotesInput}
                onChange={(e) => setFinishNotesInput(e.target.value)}
                className="text-xs rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold">Fotos do Serviço Concluído (Opcional)</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoSelect}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isCompressingPhotos}
                className="w-full h-10 rounded-xl text-xs font-bold gap-2 border-dashed"
              >
                <Camera className="w-4 h-4" />
                <span>{isCompressingPhotos ? "Processando foto..." : "Tirar / Anexar Foto"}</span>
              </Button>

              {finishPhotos.length > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto pt-1">
                  {finishPhotos.map((p, i) => (
                    <div key={i} className="relative w-16 h-16 shrink-0">
                      <img src={p} alt="" className="w-16 h-16 rounded-xl object-cover border" />
                      <button
                        type="button"
                        onClick={() => setFinishPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center text-[10px]"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setFinishModalTicket(null)} className="rounded-xl text-xs">
              Cancelar
            </Button>
            <Button
              onClick={() => finishTicketMutation.mutate()}
              disabled={finishTicketMutation.isPending}
              className="rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {finishTicketMutation.isPending ? "Finalizando..." : "🏁 Confirmar Conclusão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Meus Dados / Veículo Garagem */}
      <Dialog open={editProfileOpen} onOpenChange={setEditProfileOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-base font-black">Seus Dados & Acesso à Garagem</DialogTitle>
            <DialogDescription className="text-xs">
              Mantenha seu WhatsApp e placa atualizados para liberação rápida na portaria.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <Label className="text-xs font-bold">Seu Nome</Label>
              <Input value={workerName} onChange={(e) => setWorkerName(e.target.value)} className="h-9 text-xs rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-bold">WhatsApp com DDD</Label>
                <Input value={workerPhone} onChange={(e) => setWorkerPhone(e.target.value)} className="h-9 text-xs rounded-xl" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold">CPF</Label>
                <Input
                  value={workerCpf}
                  onChange={(e) => setWorkerCpf(formatCpfInput(e.target.value))}
                  className="h-9 text-xs rounded-xl"
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-2xl border bg-muted/30">
              <div>
                <span className="font-bold block">Precisa de Vaga na Garagem?</span>
                <span className="text-[10px] text-muted-foreground">Informa a portaria quando você pedir entrada</span>
              </div>
              <Switch checked={needsGarage} onCheckedChange={setNeedsGarage} />
            </div>

            {needsGarage && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs font-bold">Placa do Veículo</Label>
                  <Input
                    value={vehiclePlate}
                    onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())}
                    placeholder="ABC1D23"
                    className="h-9 text-xs rounded-xl uppercase"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">Modelo / Cor</Label>
                  <Input
                    value={vehicleModelColor}
                    onChange={(e) => setVehicleModelColor(e.target.value)}
                    placeholder="Ex: Fiorino Branca"
                    className="h-9 text-xs rounded-xl"
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditProfileOpen(false)} className="rounded-xl text-xs">
              Cancelar
            </Button>
            <Button
              onClick={() => saveProfileMutation.mutate()}
              disabled={saveProfileMutation.isPending}
              className="rounded-xl text-xs font-bold"
            >
              Salvar Dados
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Zoom de Foto */}
      <Dialog open={Boolean(zoomPhotoUrl)} onOpenChange={(o) => !o && setZoomPhotoUrl(null)}>
        <DialogContent className="max-w-3xl p-2 bg-black/95 border-none rounded-2xl">
          {zoomPhotoUrl && (
            <img src={zoomPhotoUrl} alt="Foto ampliada" className="w-full max-h-[82vh] object-contain rounded-xl" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
