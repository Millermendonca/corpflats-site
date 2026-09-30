import { useState, useMemo, useRef } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { compressImage } from "@/lib/image-compression";
import {
  Wrench,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Camera,
  Plus,
  Trash2,
  UserCheck,
  UserPlus,
  Sparkles,
  AlertCircle,
  FileText,
  List,
  Edit2,
  Loader2,
  X,
  Play,
  Check,
  ShieldCheck,
  Building,
  Info,
} from "lucide-react";

// Types
export interface Collaborator {
  name: string;
  cpf: string;
}

export interface WorkerIdentification {
  name: string;
  cpf: string;
}

export interface ServiceFlat {
  flatId: number;
  flatNumber: string | number;
  instructions?: string;
  status: "pending" | "in_progress" | "done";
  startedAt?: string | null;
  finishedAt?: string | null;
  workerName?: string | null;
  workerCpf?: string | null;
  estimatedFinishAt?: string | null;
  observations?: string | null;
  photos?: string[];
  needsCleaning?: boolean | null;
  wasCleanWhenStarted?: boolean | null;
  isDirty?: boolean;
  isOccupied?: boolean;
}

export interface ServiceOrderData {
  id: string;
  title: string;
  token: string;
  status: "draft" | "active" | "closed";
  createdAt: string;
  createdBy?: string;
  cleanFlatMode: "never" | "priority" | "always";
  maxSimultaneousFlats: number;
  maxFlatsPerDay: number;
  requirePhotos: boolean;
  estimatedDurationHours?: number | null;
  instructionFormat: "text" | "list";
  flats: ServiceFlat[];
}

export interface ServiceWorkerRecord {
  id: string;
  serviceOrderId: string;
  token: string;
  mainWorker: WorkerIdentification;
  collaborators: Collaborator[];
  registeredAt: string;
}

export interface PublicServiceApiResponse {
  success: boolean;
  order: ServiceOrderData;
  worker: ServiceWorkerRecord | null;
}

interface ServiceWorkerPortalProps {
  params?: { token?: string };
}

// Helpers
function formatCpf(val: string): string {
  const digits = val.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

function cleanCpfDigits(val: string): string {
  return val.replace(/\D/g, "");
}

function formatDateTime(isoStr?: string | null): string {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
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

function formatTime(isoStr?: string | null): string {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return isoStr;
  }
}

export default function ServiceWorkerPortal({ params: propsParams }: ServiceWorkerPortalProps) {
  const [, matchServico] = useRoute("/servico/:token");
  const [, matchService] = useRoute("/service/:token");
  const token = propsParams?.token || matchServico?.token || matchService?.token || "";

  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Identification State
  const [isEditingWorker, setIsEditingWorker] = useState(false);
  const [mainWorkerName, setMainWorkerName] = useState("");
  const [mainWorkerCpf, setMainWorkerCpf] = useState("");
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);

  // Guard Dialog State
  const [guardDialogOpen, setGuardDialogOpen] = useState(false);

  // Finish Modal State
  const [finishModalOpen, setFinishModalOpen] = useState(false);
  const [finishingFlat, setFinishingFlat] = useState<ServiceFlat | null>(null);
  const [needsCleaningChoice, setNeedsCleaningChoice] = useState<"yes" | "no" | null>(null);
  const [observations, setObservations] = useState("");
  const [uploadedPhotos, setUploadedPhotos] = useState<string[]>([]);
  const [isCompressingPhotos, setIsCompressingPhotos] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Query: Public Service Order
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<PublicServiceApiResponse>({
    queryKey: ["public-service-order", token],
    queryFn: async () => {
      const res = await fetch(`/api/service/public/${token}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Erro ${res.status}: Link inválido ou expirado`);
      }
      return res.json();
    },
    enabled: Boolean(token),
    refetchInterval: 10000,
  });

  const order = data?.order;
  const serverWorker = data?.worker;

  // Initialize or synchronize local worker form when data arrives
  const hasSavedWorker = Boolean(serverWorker?.mainWorker?.name && serverWorker?.mainWorker?.cpf);

  const bannerRef = useRef<HTMLDivElement>(null);

  const scrollToBanner = () => {
    if (bannerRef.current) {
      bannerRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  // Mutation: Register / Update Worker
  const registerMutation = useMutation({
    mutationFn: async () => {
      const cleanCpf = cleanCpfDigits(mainWorkerCpf);
      if (!mainWorkerName.trim()) {
        throw new Error("Por favor, informe seu nome completo.");
      }
      if (cleanCpf.length !== 11) {
        throw new Error("O CPF informado deve conter 11 dígitos numéricos.");
      }

      const validCollaborators = collaborators
        .map((c) => ({
          name: c.name.trim(),
          cpf: cleanCpfDigits(c.cpf),
        }))
        .filter((c) => c.name.length > 0 || c.cpf.length > 0);

      for (const col of validCollaborators) {
        if (!col.name || col.cpf.length !== 11) {
          throw new Error(`Ajudante "${col.name || "Sem nome"}" deve ter nome completo e CPF válido com 11 dígitos.`);
        }
      }

      const res = await fetch(`/api/service/public/${token}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mainWorker: {
            name: mainWorkerName.trim(),
            cpf: cleanCpf,
          },
          collaborators: validCollaborators,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Falha ao salvar identificação");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Identificação salva com sucesso!",
        description: "Agora você pode iniciar os atendimentos nos apartamentos.",
      });
      setIsEditingWorker(false);
      queryClient.invalidateQueries({ queryKey: ["public-service-order", token] });
    },
    onError: (err: any) => {
      toast({
        title: "Erro ao salvar identificação",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Mutation: Start Flat
  const startMutation = useMutation({
    mutationFn: async (flatId: number | string) => {
      const res = await fetch(`/api/service/public/${token}/flats/${flatId}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erro ao iniciar flat");
      }
      return res.json();
    },
    onSuccess: (_, flatId) => {
      toast({
        title: "▶️ Apartamento iniciado!",
        description: `O serviço no flat foi iniciado e a governança/recepção foi notificada.`,
      });
      queryClient.invalidateQueries({ queryKey: ["public-service-order", token] });
    },
    onError: (err: any) => {
      toast({
        title: "Não foi possível iniciar o flat",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Mutation: Finish Flat
  const finishMutation = useMutation({
    mutationFn: async ({
      flatId,
      needsCleaning,
      observations,
      photos,
    }: {
      flatId: number | string;
      needsCleaning: boolean | null;
      observations: string;
      photos: string[];
    }) => {
      const res = await fetch(`/api/service/public/${token}/flats/${flatId}/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          needsCleaning,
          observations,
          photos,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erro ao finalizar flat");
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      toast({
        title: "🏁 Serviço finalizado!",
        description: `Apartamento concluído com sucesso. Obrigado!`,
      });
      setFinishModalOpen(false);
      setFinishingFlat(null);
      setNeedsCleaningChoice(null);
      setObservations("");
      setUploadedPhotos([]);
      queryClient.invalidateQueries({ queryKey: ["public-service-order", token] });
    },
    onError: (err: any) => {
      toast({
        title: "Erro ao finalizar serviço",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Collaborator helpers
  const handleAddCollaborator = () => {
    setCollaborators((prev) => [...prev, { name: "", cpf: "" }]);
  };

  const handleUpdateCollaborator = (index: number, field: "name" | "cpf", value: string) => {
    setCollaborators((prev) => {
      const copy = [...prev];
      if (field === "cpf") {
        copy[index] = { ...copy[index], cpf: formatCpf(value) };
      } else {
        copy[index] = { ...copy[index], name: value };
      }
      return copy;
    });
  };

  const handleRemoveCollaborator = (index: number) => {
    setCollaborators((prev) => prev.filter((_, i) => i !== index));
  };

  // Start Click Handler with Identification Guard
  const handleStartFlatClick = (flat: ServiceFlat) => {
    if (!hasSavedWorker) {
      setGuardDialogOpen(true);
      return;
    }
    startMutation.mutate(flat.flatId);
  };

  // Open Finish Modal Handler
  const handleOpenFinishModal = (flat: ServiceFlat) => {
    setFinishingFlat(flat);
    setNeedsCleaningChoice(null);
    setObservations("");
    setUploadedPhotos([]);
    setFinishModalOpen(true);
  };

  // Handle Photo File Selection & Client-Side Compression
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (uploadedPhotos.length + files.length > 5) {
      toast({
        title: "Limite de fotos",
        description: "Você pode anexar no máximo 5 fotos por apartamento.",
        variant: "destructive",
      });
      return;
    }

    setIsCompressingPhotos(true);
    try {
      const compressedList: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const res = await compressImage(file, {
          maxWidth: 1280,
          maxHeight: 1280,
          quality: 0.8,
          preferredFormat: "image/webp",
        });
        compressedList.push(res.base64);
      }

      // Try uploading to backend photo endpoint to store in server storage, or fallback to compressed base64
      if (finishingFlat && token) {
        try {
          const uploadRes = await fetch(`/api/service/public/${token}/flats/${finishingFlat.flatId}/photos`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ photos: compressedList }),
          });
          if (uploadRes.ok) {
            const data = await uploadRes.json();
            if (Array.isArray(data.urls) && data.urls.length > 0) {
              setUploadedPhotos((prev) => [...prev, ...data.urls].slice(0, 5));
              toast({ title: "Fotos carregadas com sucesso!" });
              return;
            }
          }
        } catch {
          // If server photo endpoint fails, retain client-compressed base64
        }
      }

      setUploadedPhotos((prev) => [...prev, ...compressedList].slice(0, 5));
      toast({ title: "Fotos comprimidas e anexadas!" });
    } catch (err: any) {
      toast({
        title: "Erro ao processar fotos",
        description: err.message || "Falha ao processar imagens",
        variant: "destructive",
      });
    } finally {
      setIsCompressingPhotos(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemovePhoto = (index: number) => {
    setUploadedPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  // Submit Finish Service
  const handleSubmitFinish = () => {
    if (!finishingFlat) return;

    const isCleanFlat = Boolean(finishingFlat.wasCleanWhenStarted || !finishingFlat.isDirty);
    let finalNeedsCleaning: boolean | null = null;

    if (isCleanFlat) {
      if (needsCleaningChoice === null) {
        toast({
          title: "Pergunta obrigatória",
          description: "Por favor, responda se o apartamento precisa de camareira para limpeza.",
          variant: "destructive",
        });
        return;
      }
      finalNeedsCleaning = needsCleaningChoice === "yes";
    }

    if (order?.requirePhotos && uploadedPhotos.length === 0) {
      toast({
        title: "Foto obrigatória",
        description: "Esta ordem de serviço exige pelo menos 1 foto para finalização.",
        variant: "destructive",
      });
      return;
    }

    finishMutation.mutate({
      flatId: finishingFlat.flatId,
      needsCleaning: finalNeedsCleaning,
      observations: observations.trim(),
      photos: uploadedPhotos,
    });
  };

  // Progress metrics calculation
  const totalFlats = order?.flats?.length || 0;
  const doneFlats = order?.flats?.filter((f) => f.status === "done").length || 0;
  const inProgressFlats = order?.flats?.filter((f) => f.status === "in_progress").length || 0;
  const progressPercent = totalFlats > 0 ? Math.round((doneFlats / totalFlats) * 100) : 0;

  // Daily finished flats count
  const todayStr = new Date().toISOString().slice(0, 10);
  const doneTodayCount = useMemo(() => {
    return (
      order?.flats?.filter(
        (f) => f.status === "done" && f.finishedAt && f.finishedAt.slice(0, 10) === todayStr
      ).length || 0
    );
  }, [order?.flats, todayStr]);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 border rounded-2xl p-8 shadow-sm flex flex-col items-center text-center space-y-4">
          <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Carregando Ordem de Serviço</h2>
            <p className="text-xs text-muted-foreground mt-1">Conectando ao sistema CorpFlats...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (isError || !order) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900 rounded-2xl p-8 shadow-sm text-center space-y-4">
          <div className="w-14 h-14 bg-rose-100 dark:bg-rose-950/50 rounded-2xl flex items-center justify-center text-rose-600 dark:text-rose-400 mx-auto">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Link de Serviço Inválido</h2>
            <p className="text-xs text-rose-600 dark:text-rose-400 mt-2 font-medium">
              {error instanceof Error ? error.message : "Ordem de serviço não encontrada ou encerrada."}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Verifique o link enviado pela administração do hotel ou entre em contato com a recepção da CorpFlats.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-2">
            Tentar Novamente
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100/70 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Top Mobile Bar */}
      <header className="sticky top-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b px-4 py-3 shadow-xs">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-primary">CorpFlats</span>
                <span className="text-[10px] text-muted-foreground font-semibold">Portal do Prestador</span>
              </div>
              <h1 className="text-sm font-bold truncate max-w-[200px] sm:max-w-[280px] leading-tight">
                {order.title}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={
                order.status === "active"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : order.status === "closed"
                  ? "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800"
                  : "bg-amber-50 text-amber-700 border-amber-300"
              }
            >
              {order.status === "active" ? "Ativo" : order.status === "closed" ? "Encerrado" : "Rascunho"}
            </Badge>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-xl mx-auto px-4 py-5 space-y-5">
        {/* Progress & Overview Card */}
        <Card className="border-0 shadow-sm bg-white dark:bg-slate-900 rounded-2xl overflow-hidden">
          <CardContent className="p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Progresso do Serviço
                </span>
                <div className="text-lg font-black text-slate-800 dark:text-slate-100">
                  {doneFlats} de {totalFlats} flats concluídos
                </div>
              </div>
              <div className="text-right">
                <span className="text-xl font-black text-primary">{progressPercent}%</span>
              </div>
            </div>

            <Progress value={progressPercent} className="h-2.5 rounded-full" />

            <div className="grid grid-cols-2 gap-2 pt-1 text-xs text-muted-foreground">
              <div className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Simultâneos</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {inProgressFlats} de {order.maxSimultaneousFlats || 2} máx.
                </span>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Concluídos Hoje</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {doneTodayCount} de {order.maxFlatsPerDay || 4} limite/dia
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Identification Banner (R5) */}
        <div ref={bannerRef}>
          {hasSavedWorker && !isEditingWorker ? (
            // Registered / Identified State (Green / Emerald)
            <Card className="border-2 border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/30 dark:border-emerald-700 rounded-2xl shadow-sm overflow-hidden transition-all">
              <CardContent className="p-4 sm:p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                          ✓ Prestador Identificado
                        </span>
                      </div>
                      <div className="text-base font-extrabold text-emerald-950 dark:text-emerald-100">
                        {serverWorker?.mainWorker?.name}
                      </div>
                      <div className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                        CPF: {formatCpf(serverWorker?.mainWorker?.cpf || "")}
                      </div>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setMainWorkerName(serverWorker?.mainWorker?.name || "");
                      setMainWorkerCpf(formatCpf(serverWorker?.mainWorker?.cpf || ""));
                      setCollaborators(
                        serverWorker?.collaborators?.map((c) => ({
                          name: c.name,
                          cpf: formatCpf(c.cpf),
                        })) || []
                      );
                      setIsEditingWorker(true);
                    }}
                    className="text-emerald-800 hover:text-emerald-900 hover:bg-emerald-100 dark:text-emerald-300 dark:hover:bg-emerald-900/50 text-xs gap-1.5"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Editar
                  </Button>
                </div>

                {serverWorker?.collaborators && serverWorker.collaborators.length > 0 && (
                  <div className="pt-2 border-t border-emerald-200 dark:border-emerald-800/60">
                    <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider block mb-1">
                      Ajudantes / Equipe:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {serverWorker.collaborators.map((c, i) => (
                        <Badge
                          key={i}
                          variant="secondary"
                          className="bg-white/80 dark:bg-slate-900 text-emerald-900 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800 text-xs py-0.5"
                        >
                          {c.name} ({formatCpf(c.cpf)})
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            // Unregistered / Identification Form State (Visual Distinct Amber/Blue Banner)
            <Card className="border-2 border-amber-400 dark:border-amber-600 bg-amber-50/50 dark:bg-amber-950/20 rounded-2xl shadow-sm overflow-hidden">
              <CardHeader className="p-4 sm:p-5 pb-2">
                <div className="flex items-center gap-2 text-amber-800 dark:text-amber-400">
                  <UserCheck className="w-5 h-5 shrink-0" />
                  <CardTitle className="text-base font-bold">Identificação do Prestador</CardTitle>
                </div>
                <CardDescription className="text-xs text-amber-900/80 dark:text-amber-300/80 mt-1">
                  Preencha seu nome e CPF antes de iniciar qualquer serviço. Você também pode cadastrar ajudantes.
                </CardDescription>
              </CardHeader>

              <CardContent className="p-4 sm:p-5 pt-2 space-y-4">
                {/* Main Worker Inputs */}
                <div className="space-y-3 bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-amber-200 dark:border-slate-800">
                  <div>
                    <Label className="text-xs font-semibold">Nome Completo do Responsável *</Label>
                    <Input
                      placeholder="Ex: João da Silva"
                      value={mainWorkerName}
                      onChange={(e) => setMainWorkerName(e.target.value)}
                      className="mt-1 text-sm bg-transparent"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold">CPF do Responsável *</Label>
                    <Input
                      placeholder="000.000.000-00"
                      value={mainWorkerCpf}
                      onChange={(e) => setMainWorkerCpf(formatCpf(e.target.value))}
                      maxLength={14}
                      className="mt-1 text-sm bg-transparent"
                    />
                  </div>
                </div>

                {/* Collaborators Section */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Ajudantes / Equipe (Opcional)
                    </Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddCollaborator}
                      className="h-7 text-xs gap-1 border-dashed text-primary hover:text-primary"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      + Adicionar Ajudante
                    </Button>
                  </div>

                  {collaborators.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground italic">
                      Nenhum ajudante adicionado. Clique acima caso esteja acompanhado de auxiliares.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {collaborators.map((collab, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-2 bg-white dark:bg-slate-900 p-2.5 rounded-xl border shadow-2xs"
                        >
                          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <Input
                              placeholder="Nome do ajudante"
                              value={collab.name}
                              onChange={(e) => handleUpdateCollaborator(index, "name", e.target.value)}
                              className="h-8 text-xs bg-transparent"
                            />
                            <Input
                              placeholder="CPF do ajudante"
                              value={collab.cpf}
                              onChange={(e) => handleUpdateCollaborator(index, "cpf", e.target.value)}
                              maxLength={14}
                              className="h-8 text-xs bg-transparent"
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveCollaborator(index)}
                            className="h-8 w-8 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>

              <CardFooter className="p-4 sm:p-5 pt-0 flex gap-2">
                <Button
                  onClick={() => registerMutation.mutate()}
                  disabled={registerMutation.isPending || !mainWorkerName.trim() || cleanCpfDigits(mainWorkerCpf).length !== 11}
                  className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs h-9 shadow-xs"
                >
                  {registerMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                  ) : (
                    <Check className="w-4 h-4 mr-1.5" />
                  )}
                  Salvar Identificação
                </Button>

                {hasSavedWorker && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditingWorker(false)}
                    className="text-xs h-9"
                  >
                    Cancelar
                  </Button>
                )}
              </CardFooter>
            </Card>
          )}
        </div>

        {/* Flats List Header */}
        <div className="space-y-1 pt-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Building className="w-4 h-4 text-primary" />
              Apartamentos do Serviço ({order.flats.length})
            </h2>
            {isFetching && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-medium">
                <Loader2 className="w-3 h-3 animate-spin text-primary" /> Atualizando...
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Siga as regras de atendimento e registre as informações em cada apartamento.
          </p>
        </div>

        {/* Flats Cards List (R5) */}
        <div className="space-y-4">
          {order.flats.map((flat) => {
            // Occupancy Badge
            let occupancyBadge = (
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 text-[11px] font-semibold">
                🟢 Vago / Limpo
              </Badge>
            );
            if (flat.isOccupied) {
              occupancyBadge = (
                <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/40 text-[11px] font-semibold">
                  🔴 Ocupado por Hóspede
                </Badge>
              );
            } else if (flat.isDirty) {
              occupancyBadge = (
                <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 text-[11px] font-semibold">
                  🧹 Sujo / Pós-Checkout
                </Badge>
              );
            }

            // Current Status Badge
            let statusBadge = (
              <Badge variant="secondary" className="bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-xs font-semibold">
                Pendente
              </Badge>
            );
            if (flat.status === "in_progress") {
              statusBadge = (
                <Badge className="bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold animate-pulse shadow-xs flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-white animate-ping mr-0.5" />
                  Em Andamento
                </Badge>
              );
            } else if (flat.status === "done") {
              statusBadge = (
                <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 shadow-xs">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Finalizado
                </Badge>
              );
            }

            // Dynamic evaluation for Pending State
            const maxSimul = order.maxSimultaneousFlats || 2;
            const maxDaily = order.maxFlatsPerDay || 4;
            const isSimulLimitReached = inProgressFlats >= maxSimul;
            const isDailyLimitReached = doneTodayCount >= maxDaily;
            const isClean = !flat.isDirty;
            const cleanFlatMode = order.cleanFlatMode || "priority";

            let isCleanModeBlocked = false;
            let cleanModeReason = "";
            let prioritySuggested = false;

            if (isClean) {
              if (cleanFlatMode === "never") {
                isCleanModeBlocked = true;
                cleanModeReason = "Bloqueado: serviço não permite flats limpos.";
              } else if (cleanFlatMode === "priority") {
                const otherDirty = order.flats.some(
                  (f) =>
                    Number(f.flatId) !== Number(flat.flatId) &&
                    f.status !== "done" &&
                    Boolean(f.isDirty)
                );
                if (otherDirty) {
                  isCleanModeBlocked = true;
                  cleanModeReason = "Bloqueado: priorize os apartamentos sujos primeiro.";
                }
              }
            } else {
              if (cleanFlatMode === "always") {
                prioritySuggested = true;
              }
            }

            // Action Button logic for pending
            let canStart = true;
            let disabledReason = "";

            if (isSimulLimitReached) {
              canStart = false;
              disabledReason = `Limite de simultâneos atingido (máx: ${maxSimul}). Finalize o flat em andamento.`;
            } else if (isDailyLimitReached) {
              canStart = false;
              disabledReason = `Limite diário de ${maxDaily} flats atingido para hoje.`;
            } else if (isCleanModeBlocked) {
              canStart = false;
              disabledReason = cleanModeReason;
            }

            return (
              <Card
                key={flat.flatId}
                className={`border rounded-2xl shadow-xs transition-all overflow-hidden ${
                  flat.status === "in_progress"
                    ? "border-sky-400 bg-sky-50/20 dark:bg-sky-950/20 shadow-md ring-1 ring-sky-300 dark:ring-sky-800"
                    : flat.status === "done"
                    ? "border-emerald-200 bg-slate-50/70 dark:bg-slate-900/60 opacity-90"
                    : "border-slate-200 bg-white dark:bg-slate-900"
                }`}
              >
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
                          Flat {flat.flatNumber}
                        </span>
                        {occupancyBadge}
                      </div>

                      {prioritySuggested && flat.status === "pending" && (
                        <div className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800">
                          ⭐ Recomendado iniciar este primeiro
                        </div>
                      )}
                    </div>

                    <div className="shrink-0">{statusBadge}</div>
                  </div>
                </CardHeader>

                <CardContent className="p-4 pt-2 space-y-3">
                  {/* Instructions */}
                  {flat.instructions ? (
                    <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 border text-xs">
                      <div className="flex items-center gap-1.5 font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider text-[10px] mb-1">
                        {order.instructionFormat === "list" ? (
                          <>
                            <List className="w-3.5 h-3.5 text-primary" /> Checklist / Instruções:
                          </>
                        ) : (
                          <>
                            <FileText className="w-3.5 h-3.5 text-primary" /> Instruções do Flat:
                          </>
                        )}
                      </div>

                      {order.instructionFormat === "list" ? (
                        <ul className="space-y-1 list-disc list-inside text-slate-700 dark:text-slate-200">
                          {flat.instructions
                            .split("\n")
                            .filter((line) => line.trim().length > 0)
                            .map((item, idx) => (
                              <li key={idx} className="leading-snug">
                                {item.replace(/^[-*•]\s*/, "")}
                              </li>
                            ))}
                        </ul>
                      ) : (
                        <p className="whitespace-pre-line text-slate-700 dark:text-slate-200 leading-relaxed">
                          {flat.instructions}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground italic">
                      Nenhuma instrução específica para este flat.
                    </p>
                  )}

                  {/* Started / Finished Information */}
                  {flat.status === "in_progress" && (
                    <div className="flex flex-wrap items-center gap-3 text-xs bg-sky-50 dark:bg-sky-950/40 p-2.5 rounded-xl border border-sky-200 dark:border-sky-900 text-sky-900 dark:text-sky-200 font-medium">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                        <span>Iniciado às {formatTime(flat.startedAt)}</span>
                      </div>
                      {flat.estimatedFinishAt && (
                        <div className="text-[11px] text-sky-700 dark:text-sky-300">
                          (Previsão: {formatTime(flat.estimatedFinishAt)})
                        </div>
                      )}
                    </div>
                  )}

                  {flat.status === "done" && (
                    <div className="space-y-2 text-xs bg-emerald-50/60 dark:bg-emerald-950/20 p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-900">
                      <div className="flex items-center justify-between text-emerald-800 dark:text-emerald-300 font-semibold">
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Finalizado em {formatDateTime(flat.finishedAt)}
                        </span>
                        {flat.needsCleaning !== null && flat.needsCleaning !== undefined && (
                          <span className="text-[11px]">
                            Camareira: {flat.needsCleaning ? "Sim 🧹" : "Não ✓"}
                          </span>
                        )}
                      </div>

                      {flat.observations && (
                        <p className="text-[11px] text-muted-foreground italic pt-1 border-t border-emerald-100 dark:border-emerald-900">
                          Obs: "{flat.observations}"
                        </p>
                      )}

                      {flat.photos && flat.photos.length > 0 && (
                        <div className="pt-1 flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] uppercase font-bold text-emerald-700">Fotos:</span>
                          {flat.photos.map((photo, i) => (
                            <a
                              key={i}
                              href={photo}
                              target="_blank"
                              rel="noreferrer"
                              className="w-8 h-8 rounded-lg overflow-hidden border border-emerald-300 hover:scale-110 transition-transform"
                            >
                              <img src={photo} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>

                {/* Card Action Button */}
                <CardFooter className="p-4 pt-0">
                  {flat.status === "pending" && (
                    <div className="w-full space-y-1.5">
                      <Button
                        onClick={() => handleStartFlatClick(flat)}
                        disabled={!canStart || startMutation.isPending}
                        className={`w-full font-bold text-xs h-10 shadow-xs ${
                          canStart
                            ? "bg-primary hover:bg-primary/90 text-primary-foreground"
                            : "bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400 cursor-not-allowed opacity-80"
                        }`}
                      >
                        {startMutation.isPending && startMutation.variables === flat.flatId ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                        ) : (
                          <Play className="w-4 h-4 mr-1.5 fill-current" />
                        )}
                        ▶️ Iniciar Apartamento
                      </Button>

                      {!canStart && (
                        <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium text-center px-1">
                          {disabledReason}
                        </p>
                      )}
                    </div>
                  )}

                  {flat.status === "in_progress" && (
                    <Button
                      onClick={() => handleOpenFinishModal(flat)}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-10 shadow-md flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      🏁 Finalizar Serviço
                    </Button>
                  )}

                  {flat.status === "done" && (
                    <div className="w-full py-1.5 text-center text-xs text-emerald-700 dark:text-emerald-400 font-bold flex items-center justify-center gap-1">
                      <CheckCircle2 className="w-4 h-4" />
                      ✓ Concluído ({formatDateTime(flat.finishedAt)})
                    </div>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </main>

      {/* Guard Dialog: Blocking Action when Identification Not Saved */}
      <Dialog open={guardDialogOpen} onOpenChange={setGuardDialogOpen}>
        <DialogContent className="max-w-md rounded-2xl p-6">
          <DialogHeader className="space-y-3">
            <div className="w-12 h-12 bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400 rounded-2xl flex items-center justify-center mx-auto">
              <AlertCircle className="w-7 h-7" />
            </div>
            <DialogTitle className="text-center text-lg font-black text-slate-800 dark:text-slate-100">
              Identificação Obrigatória
            </DialogTitle>
            <DialogDescription className="text-center text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
              Identificação Obrigatória: Você precisa preencher e salvar sua identificação (Nome e CPF) antes de iniciar qualquer apartamento.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-4 flex flex-col sm:flex-row gap-2">
            <Button
              onClick={() => {
                setGuardDialogOpen(false);
                scrollToBanner();
              }}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs h-10"
            >
              Preencher Identificação Agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Finish Modal (R5) */}
      <Dialog open={finishModalOpen} onOpenChange={setFinishModalOpen}>
        <DialogContent className="max-w-md sm:max-w-lg rounded-2xl p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              Finalizar Serviço — Flat {finishingFlat?.flatNumber}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Preencha o formulário abaixo para confirmar o término dos trabalhos neste apartamento.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Warning Callout */}
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="font-semibold leading-relaxed">
                Atenção: verifique se todo o serviço foi inspecionado e o apartamento está em condições adequadas.
              </p>
            </div>

            {/* Mandatory Cleaning Question for Clean Flats */}
            {(finishingFlat?.wasCleanWhenStarted === true || !finishingFlat?.isDirty) && (
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/70 border-2 border-primary/20 rounded-xl space-y-2.5">
                <Label className="text-xs font-bold text-slate-800 dark:text-slate-100 block">
                  Precisa de camareira para finalizar a limpeza? *
                </Label>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Este quarto estava limpo ao iniciar. Informe se houve sujeira, poeira de obra ou se é necessária higienização completa pela equipe de governança.
                </p>

                <RadioGroup
                  value={needsCleaningChoice || ""}
                  onValueChange={(val) => setNeedsCleaningChoice(val as "yes" | "no")}
                  className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1"
                >
                  <label
                    htmlFor="clean-yes"
                    className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                      needsCleaningChoice === "yes"
                        ? "bg-amber-50 border-amber-500 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
                        : "bg-white dark:bg-slate-900 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    <RadioGroupItem value="yes" id="clean-yes" />
                    <span>Sim, precisa de camareira</span>
                  </label>

                  <label
                    htmlFor="clean-no"
                    className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                      needsCleaningChoice === "no"
                        ? "bg-emerald-50 border-emerald-500 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200"
                        : "bg-white dark:bg-slate-900 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    <RadioGroupItem value="no" id="clean-no" />
                    <span>Não, mantido limpo</span>
                  </label>
                </RadioGroup>
              </div>
            )}

            {/* Observations Textarea */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Observações do Serviço</Label>
              <Textarea
                placeholder="Ex: Pintura da parede lateral finalizada, rejunte do banheiro refeito, tinta utilizada Coral Branca..."
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
                className="text-xs min-h-[75px]"
              />
            </div>

            {/* Photo Upload (max 5 photos, camera capture, compressImage) */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold flex items-center gap-1.5">
                  <Camera className="w-4 h-4 text-primary" />
                  Fotos do Serviço {order.requirePhotos && <span className="text-rose-500 font-bold">*</span>}
                </Label>
                <span className="text-[11px] text-muted-foreground font-medium">
                  {uploadedPhotos.length} de 5 fotos
                </span>
              </div>

              {/* Upload trigger input */}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                ref={fileInputRef}
                onChange={handlePhotoSelect}
                className="hidden"
              />

              {uploadedPhotos.length < 5 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isCompressingPhotos}
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-11 border-dashed border-2 border-primary/40 bg-primary/5 hover:bg-primary/10 text-primary font-semibold text-xs flex items-center justify-center gap-2"
                >
                  {isCompressingPhotos ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Comprimindo fotos no aparelho...
                    </>
                  ) : (
                    <>
                      <Camera className="w-4 h-4" />
                      Tirar Foto ou Escolher da Galeria
                    </>
                  )}
                </Button>
              )}

              {/* Photos Previews */}
              {uploadedPhotos.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 pt-1">
                  {uploadedPhotos.map((photo, idx) => (
                    <div
                      key={idx}
                      className="relative group aspect-square rounded-xl overflow-hidden border-2 border-slate-200 dark:border-slate-800 bg-slate-100"
                    >
                      <img src={photo} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(idx)}
                        className="absolute top-1 right-1 w-5 h-5 bg-rose-600 text-white rounded-full flex items-center justify-center opacity-90 hover:opacity-100 shadow-xs"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {order.requirePhotos && (
                <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                  ⚠️ É obrigatório anexar pelo menos 1 foto para finalizar este serviço.
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="mt-4 flex flex-col-reverse sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFinishModalOpen(false)}
              className="text-xs h-10 sm:w-auto"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSubmitFinish}
              disabled={
                finishMutation.isPending ||
                isCompressingPhotos ||
                ((finishingFlat?.wasCleanWhenStarted === true || !finishingFlat?.isDirty) && needsCleaningChoice === null) ||
                (Boolean(order.requirePhotos) && uploadedPhotos.length === 0)
              }
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-10 shadow-xs"
            >
              {finishMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mr-1.5" />
              )}
              Confirmar e Finalizar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
