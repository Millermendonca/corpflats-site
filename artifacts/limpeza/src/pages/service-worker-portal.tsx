import { useState, useMemo, useRef, useEffect } from "react";
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
  Car,
  KeyRound,
  Lock,
} from "lucide-react";

// Types
export interface Collaborator {
  name: string;
  cpf: string;
}

export interface WorkerIdentification {
  name: string;
  cpf: string;
  phone?: string;
}

export interface WorkerVehicle {
  needsGarage: boolean;
  plate?: string;
  modelColor?: string;
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
  cleaningStatus?: string;
  occupancyStatus?: string;
  currentGuest?: string | null;
  hasCheckinToday?: boolean;
  hasCheckoutToday?: boolean;
  expectedArrival?: string | null;
  entryRequested?: boolean;
  entryRequestedAt?: string | null;
  operationalScenario?: string;
  operationalScenarioLabel?: string;
  operationalScenarioIcon?: string;
  isStatusAllowed?: boolean;
  statusBlockReason?: string | null;
  hasGuestInside?: boolean;
  scenarioWarning?: string | null;
}

export interface ServiceOrderData {
  id: string;
  title: string;
  token: string;
  status: "draft" | "active" | "closed";
  createdAt: string;
  createdBy?: string;
  cleanFlatMode: "never" | "priority" | "always";
  allowedRoomStatuses?: string[];
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
  vehicle?: WorkerVehicle;
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
  const [mainWorkerPhone, setMainWorkerPhone] = useState("");
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [needsGarage, setNeedsGarage] = useState(false);
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [vehicleModelColor, setVehicleModelColor] = useState("");

  // Guard Dialog State
  const [guardDialogOpen, setGuardDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ type: "request_entry" | "start"; flat: ServiceFlat } | null>(null);

  // Guest Warning Modal State (Mandatory confirmation for flats with guests inside)
  const [guestWarningModalOpen, setGuestWarningModalOpen] = useState(false);
  const [guestWarningFlat, setGuestWarningFlat] = useState<ServiceFlat | null>(null);
  const [guestWarningAction, setGuestWarningAction] = useState<"request_entry" | "start" | null>(null);

  // Start Modal State (Required estimated finish)
  const [startModalOpen, setStartModalOpen] = useState(false);
  const [startingFlat, setStartingFlat] = useState<ServiceFlat | null>(null);
  const [estimatedFinishInput, setEstimatedFinishInput] = useState("");

  // Update Estimate Modal State
  const [estimateModalOpen, setEstimateModalOpen] = useState(false);
  const [estimatingFlat, setEstimatingFlat] = useState<ServiceFlat | null>(null);
  const [newEstimateInput, setNewEstimateInput] = useState("");

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

  // Sync serverWorker data into local form states if available and not manually editing
  useEffect(() => {
    if (serverWorker?.mainWorker?.name && !isEditingWorker) {
      setMainWorkerName(serverWorker.mainWorker.name);
      setMainWorkerCpf(formatCpf(serverWorker.mainWorker.cpf || ""));
      if (serverWorker.mainWorker.phone) {
        setMainWorkerPhone(serverWorker.mainWorker.phone);
      }
      if (Array.isArray(serverWorker.collaborators)) {
        setCollaborators(
          serverWorker.collaborators.map((c) => ({
            name: c.name,
            cpf: formatCpf(c.cpf || ""),
          }))
        );
      }
      if (serverWorker.vehicle) {
        setNeedsGarage(Boolean(serverWorker.vehicle.needsGarage));
        setVehiclePlate(serverWorker.vehicle.plate || "");
        setVehicleModelColor(serverWorker.vehicle.modelColor || "");
      }
    }
  }, [serverWorker, isEditingWorker]);

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

      const cleanPlate = vehiclePlate.trim().toUpperCase();
      const cleanModelColor = vehicleModelColor.trim();

      if (needsGarage && !cleanPlate) {
        throw new Error("Por favor, informe a placa do veículo para liberação do acesso à garagem.");
      }

      const cleanPhone = mainWorkerPhone.replace(/\D/g, "");

      const res = await fetch(`/api/service/public/${token}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mainWorker: {
            name: mainWorkerName.trim(),
            cpf: cleanCpf,
            phone: cleanPhone,
          },
          collaborators: validCollaborators,
          vehicle: {
            needsGarage,
            plate: cleanPlate,
            modelColor: cleanModelColor,
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Falha ao salvar identificação");
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Identificação salva com sucesso!",
        description: "Agora você pode solicitar entrada e iniciar os atendimentos nos apartamentos.",
      });
      setIsEditingWorker(false);
      queryClient.setQueryData(["public-service-order", token], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          worker: data?.worker || {
            mainWorker: {
              name: mainWorkerName.trim(),
              cpf: cleanCpfDigits(mainWorkerCpf),
              phone: mainWorkerPhone.replace(/\D/g, ""),
            },
            collaborators,
            vehicle: {
              needsGarage,
              plate: vehiclePlate.trim().toUpperCase(),
              modelColor: vehicleModelColor.trim(),
            },
          },
        };
      });
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

  // Mutation: Request Entry
  const requestEntryMutation = useMutation({
    mutationFn: async (flatId: number | string) => {
      const res = await fetch(`/api/service/public/${token}/flats/${flatId}/request-entry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erro ao solicitar entrada na recepção");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "🔑 Entrada solicitada!",
        description: "A recepção foi notificada com seus dados e do serviço para autorizar sua entrada.",
      });
      queryClient.invalidateQueries({ queryKey: ["public-service-order", token] });
    },
    onError: (err: any) => {
      toast({
        title: "Não foi possível solicitar entrada",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Mutation: Start Flat
  const startMutation = useMutation({
    mutationFn: async (args: number | string | { flatId: number | string; workerName?: string; workerCpf?: string; estimatedFinishAt?: string }) => {
      const flatId = typeof args === "object" ? args.flatId : args;
      const body: any = {};
      if (typeof args === "object") {
        if (args.workerName) body.workerName = args.workerName;
        if (args.workerCpf) body.workerCpf = args.workerCpf;
        if (args.estimatedFinishAt) body.estimatedFinishAt = args.estimatedFinishAt;
      }
      const res = await fetch(`/api/service/public/${token}/flats/${flatId}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erro ao iniciar flat");
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      toast({
        title: "▶️ Apartamento iniciado!",
        description: `O serviço no flat foi iniciado e a governança/recepção foi notificada.`,
      });
      setStartModalOpen(false);
      setStartingFlat(null);
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

  // Mutation: Update Estimated Finish
  const updateEstimateMutation = useMutation({
    mutationFn: async ({ flatId, estimatedFinishAt }: { flatId: number | string; estimatedFinishAt: string }) => {
      const res = await fetch(`/api/service/public/${token}/flats/${flatId}/update-estimate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estimatedFinishAt }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erro ao atualizar previsão");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "⏱️ Previsão atualizada!",
        description: "A administração e a portaria foram notificadas sobre a nova previsão de término.",
      });
      setEstimateModalOpen(false);
      setEstimatingFlat(null);
      queryClient.invalidateQueries({ queryKey: ["public-service-order", token] });
    },
    onError: (err: any) => {
      toast({
        title: "Erro ao atualizar previsão",
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

  const triggerStartModal = (flat: ServiceFlat) => {
    setStartingFlat(flat);
    const def = new Date(Date.now() + (order?.estimatedDurationHours || 2) * 3600000);
    const defStr = new Date(def.getTime() - def.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setEstimatedFinishInput(defStr);
    setStartModalOpen(true);
  };

  // Start Click Handler with Identification Guard and Guest Warning
  const handleStartFlatClick = (flat: ServiceFlat) => {
    setPendingAction({ type: "start", flat });
    if (!hasSavedWorker) {
      setGuardDialogOpen(true);
      return;
    }
    const hasGuest = Boolean(
      flat.hasGuestInside ||
      flat.operationalScenario === "stayover" ||
      flat.operationalScenario === "checkout_pendente"
    );
    if (hasGuest) {
      setGuestWarningFlat(flat);
      setGuestWarningAction("start");
      setGuestWarningModalOpen(true);
      return;
    }
    triggerStartModal(flat);
  };

  // Request Entry Handler with Identification Guard and Guest Warning
  const handleRequestEntry = (flat: ServiceFlat) => {
    if (!hasSavedWorker) {
      setPendingAction({ type: "request_entry", flat });
      setGuardDialogOpen(true);
      return;
    }
    const hasGuest = Boolean(
      flat.hasGuestInside ||
      flat.operationalScenario === "stayover" ||
      flat.operationalScenario === "checkout_pendente"
    );
    if (hasGuest) {
      setGuestWarningFlat(flat);
      setGuestWarningAction("request_entry");
      setGuestWarningModalOpen(true);
      return;
    }
    requestEntryMutation.mutate(flat.flatId);
  };

  const handleConfirmGuestWarning = () => {
    setGuestWarningModalOpen(false);
    if (!guestWarningFlat) return;
    if (guestWarningAction === "request_entry") {
      requestEntryMutation.mutate(guestWarningFlat.flatId);
    } else if (guestWarningAction === "start") {
      triggerStartModal(guestWarningFlat);
    }
  };

  // Confirm Start Service with Estimated Finish Time
  const handleConfirmStart = () => {
    if (!startingFlat) return;
    if (!estimatedFinishInput) {
      toast({
        title: "Previsão obrigatória",
        description: "Por favor, informe a data e hora prevista de conclusão.",
        variant: "destructive",
      });
      return;
    }
    const selectedDate = new Date(estimatedFinishInput);
    if (isNaN(selectedDate.getTime())) {
      toast({
        title: "Data inválida",
        description: "Por favor, informe uma data e hora válida.",
        variant: "destructive",
      });
      return;
    }
    if (selectedDate.getTime() <= Date.now()) {
      toast({
        title: "Horário inválido",
        description: "A previsão de término deve ser posterior ao horário atual.",
        variant: "destructive",
      });
      return;
    }
    const isoDate = selectedDate.toISOString();
    startMutation.mutate({
      flatId: startingFlat.flatId,
      estimatedFinishAt: isoDate,
    });
  };

  // Open Update Estimate Modal
  const handleOpenEstimateModal = (flat: ServiceFlat) => {
    setEstimatingFlat(flat);
    if (flat.estimatedFinishAt) {
      try {
        const d = new Date(flat.estimatedFinishAt);
        const str = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        setNewEstimateInput(str);
      } catch {
        const d = new Date(Date.now() + 3600000);
        setNewEstimateInput(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
      }
    } else {
      const d = new Date(Date.now() + 3600000);
      setNewEstimateInput(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
    }
    setEstimateModalOpen(true);
  };

  // Confirm Update Estimate
  const handleConfirmUpdateEstimate = () => {
    if (!estimatingFlat) return;
    if (!newEstimateInput) {
      toast({
        title: "Nova previsão obrigatória",
        description: "Por favor, selecione a nova data e hora prevista de término.",
        variant: "destructive",
      });
      return;
    }
    const selectedDate = new Date(newEstimateInput);
    if (isNaN(selectedDate.getTime())) {
      toast({
        title: "Data inválida",
        description: "Por favor, informe uma data e hora válida.",
        variant: "destructive",
      });
      return;
    }
    if (selectedDate.getTime() <= Date.now()) {
      toast({
        title: "Horário inválido",
        description: "A nova previsão deve ser posterior ao horário atual.",
        variant: "destructive",
      });
      return;
    }
    const isoDate = selectedDate.toISOString();
    updateEstimateMutation.mutate({
      flatId: estimatingFlat.flatId,
      estimatedFinishAt: isoDate,
    });
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
                      {serverWorker?.mainWorker?.phone && (
                        <div className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                          WhatsApp: {serverWorker.mainWorker.phone}
                        </div>
                      )}
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setMainWorkerName(serverWorker?.mainWorker?.name || "");
                      setMainWorkerCpf(formatCpf(serverWorker?.mainWorker?.cpf || ""));
                      setMainWorkerPhone(serverWorker?.mainWorker?.phone || "");
                      setCollaborators(
                        serverWorker?.collaborators?.map((c) => ({
                          name: c.name,
                          cpf: formatCpf(c.cpf),
                        })) || []
                      );
                      setNeedsGarage(Boolean(serverWorker?.vehicle?.needsGarage));
                      setVehiclePlate(serverWorker?.vehicle?.plate || "");
                      setVehicleModelColor(serverWorker?.vehicle?.modelColor || "");
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

                {serverWorker?.vehicle && (
                  <div className="pt-2 border-t border-emerald-200 dark:border-emerald-800/60 flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">
                      Veículo & Garagem:
                    </span>
                    {serverWorker.vehicle.needsGarage ? (
                      <Badge
                        variant="secondary"
                        className="bg-white/80 dark:bg-slate-900 text-emerald-900 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800 text-xs py-0.5 flex items-center gap-1"
                      >
                        <Car className="w-3 h-3 text-emerald-700" />
                        Garagem Solicitada: {serverWorker.vehicle.plate || "Sem placa"} {serverWorker.vehicle.modelColor ? `(${serverWorker.vehicle.modelColor})` : ""}
                      </Badge>
                    ) : (
                      <Badge
                        variant="secondary"
                        className="bg-white/80 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 text-xs py-0.5"
                      >
                        Sem vaga de garagem
                      </Badge>
                    )}
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
                  <div>
                    <Label className="text-xs font-semibold">WhatsApp / Celular (para avisos do serviço)</Label>
                    <Input
                      placeholder="Ex: 22999999999"
                      value={mainWorkerPhone}
                      onChange={(e) => setMainWorkerPhone(e.target.value)}
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

                {/* Vehicle & Garage Access (Requirement 5) */}
                <div className="space-y-3 bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-amber-200 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="needs-garage-checkbox"
                      checked={needsGarage}
                      onChange={(e) => setNeedsGarage(e.target.checked)}
                      className="w-4 h-4 rounded text-primary focus:ring-primary border-slate-300 cursor-pointer"
                    />
                    <Label htmlFor="needs-garage-checkbox" className="text-xs font-bold text-slate-800 dark:text-slate-100 cursor-pointer flex items-center gap-1.5">
                      <Car className="w-3.5 h-3.5 text-primary" />
                      Precisa de vaga na garagem para o veículo?
                    </Label>
                  </div>

                  {needsGarage && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      <div>
                        <Label className="text-xs font-semibold">Placa do Veículo *</Label>
                        <Input
                          placeholder="Ex: ABC-1234 ou ABC1D23"
                          value={vehiclePlate}
                          onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())}
                          maxLength={10}
                          className="mt-1 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-xs font-semibold">Modelo / Cor do Veículo</Label>
                        <Input
                          placeholder="Ex: Fiat Uno Branco"
                          value={vehicleModelColor}
                          onChange={(e) => setVehicleModelColor(e.target.value)}
                          className="mt-1 text-xs"
                        />
                      </div>
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
            // Occupancy Badge (Requirement 1: No guest name, show expected arrival if check-in today)
            let occupancyBadge = (
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 text-[11px] font-semibold">
                🟢 Vago / Limpo
              </Badge>
            );
            if (flat.hasCheckinToday) {
              occupancyBadge = (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/40 text-[11px] font-semibold">
                    🔵 Entrada Prevista: {flat.expectedArrival || "14:00"}
                  </Badge>
                  {flat.isOccupied && (
                    <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 text-[10px] font-medium">
                      🔴 Desocupação hoje
                    </Badge>
                  )}
                </div>
              );
            } else if (flat.isOccupied) {
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
                    Boolean(f.isDirty) &&
                    f.isStatusAllowed !== false
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

            // Allowed Room Statuses Evaluation
            const isStatusAllowed = flat.isStatusAllowed !== false;
            const statusBlockReason = flat.statusBlockReason || "Bloqueado: status do apartamento não autorizado para este serviço.";

            // Action Button logic for pending
            let canStart = true;
            let disabledReason = "";

            if (!isStatusAllowed) {
              canStart = false;
              disabledReason = statusBlockReason;
            } else if (isSimulLimitReached) {
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
                    : !isStatusAllowed
                    ? "border-slate-200 bg-slate-50/60 dark:bg-slate-900/60 opacity-80"
                    : "border-slate-200 bg-white dark:bg-slate-900"
                }`}
              >
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
                          Flat {flat.flatNumber}
                        </span>
                        {flat.operationalScenarioIcon && flat.operationalScenarioLabel ? (
                          <Badge variant="outline" className="text-[11px] font-semibold flex items-center gap-1">
                            <span>{flat.operationalScenarioIcon}</span>
                            <span>{flat.operationalScenarioLabel}</span>
                          </Badge>
                        ) : (
                          occupancyBadge
                        )}
                        {!isStatusAllowed && (
                          <Badge variant="destructive" className="bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-700 text-[10px] font-bold flex items-center gap-1 py-0.5 px-2">
                            <Lock className="w-3 h-3 shrink-0" /> {statusBlockReason}
                          </Badge>
                        )}
                      </div>

                      {prioritySuggested && flat.status === "pending" && isStatusAllowed && (
                        <div className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800">
                          ⭐ Recomendado iniciar este primeiro
                        </div>
                      )}
                    </div>

                    <div className="shrink-0">{statusBadge}</div>
                  </div>
                </CardHeader>

                <CardContent className="p-4 pt-2 space-y-3">
                  {/* Warning Banner: Quarto com Hóspede Dentro */}
                  {(flat.hasGuestInside || flat.operationalScenario === "stayover" || flat.operationalScenario === "checkout_pendente") && flat.status !== "done" && (
                    <div className="p-2.5 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">⚠️ Hóspede no quarto</span>
                        <p className="text-[11px] leading-snug mt-0.5">
                          Bater na porta antes de entrar e verificar se foi comunicado pela recepção.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Warning Banner: Em Limpeza */}
                  {flat.operationalScenario === "em_limpeza" && flat.status !== "done" && (
                    <div className="p-2.5 rounded-xl border border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-950/40 text-purple-900 dark:text-purple-200 text-xs flex items-start gap-2">
                      <Sparkles className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">🧽 Camareira no local</span>
                        <p className="text-[11px] leading-snug mt-0.5">
                          {flat.scenarioWarning || "Camareira em atendimento no apartamento no momento."}
                        </p>
                      </div>
                    </div>
                  )}

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
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-sky-50 dark:bg-sky-950/40 p-2.5 rounded-xl border border-sky-200 dark:border-sky-900 text-sky-900 dark:text-sky-200 font-medium">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                          <span>Iniciado às {formatTime(flat.startedAt)}</span>
                        </div>
                        {flat.estimatedFinishAt && (
                          <div className="text-[11px] text-sky-700 dark:text-sky-300 font-semibold">
                            Previsão: {formatDateTime(flat.estimatedFinishAt)}
                          </div>
                        )}
                      </div>

                      {flat.estimatedFinishAt && new Date().getTime() > new Date(flat.estimatedFinishAt).getTime() && (
                        <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 rounded-xl flex items-center justify-between text-xs text-rose-900 dark:text-rose-200">
                          <div className="flex items-center gap-1.5 font-bold">
                            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                            <span>Serviço atrasado! (Previsão: {formatTime(flat.estimatedFinishAt)})</span>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenEstimateModal(flat)}
                            className="h-6 text-[10px] bg-white text-rose-700 border-rose-300 hover:bg-rose-50 px-2 shrink-0 font-semibold"
                          >
                            Atualizar Previsão
                          </Button>
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

                {/* Card Action Button (Requirement 3: Solicitar Entrada -> Iniciar Serviço -> Finalizar Serviço) */}
                <CardFooter className="p-4 pt-0">
                  {flat.status === "pending" && (
                    <div className="w-full space-y-2">
                      {!flat.entryRequested ? (
                        <Button
                          onClick={() => handleRequestEntry(flat)}
                          disabled={!canStart || requestEntryMutation.isPending}
                          className={`w-full font-bold text-xs h-10 shadow-xs flex items-center justify-center gap-1.5 ${
                            canStart
                              ? "bg-amber-600 hover:bg-amber-700 text-white"
                              : "bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400 cursor-not-allowed opacity-80"
                          }`}
                        >
                          {requestEntryMutation.isPending && requestEntryMutation.variables === flat.flatId ? (
                            <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                          ) : !isStatusAllowed ? (
                            <Lock className="w-4 h-4 mr-1.5" />
                          ) : (
                            <KeyRound className="w-4 h-4 mr-1.5" />
                          )}
                          {!isStatusAllowed ? "🔒 Bloqueado para este Serviço" : "🔑 1. Solicitar Entrada"}
                        </Button>
                      ) : (
                        <>
                          <div className="flex items-center gap-1.5 text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 p-2.5 rounded-xl border border-amber-200 dark:border-amber-800">
                            <KeyRound className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span className="font-medium">
                              Entrada solicitada às {formatTime(flat.entryRequestedAt)}. Liberação enviada à recepção.
                            </span>
                          </div>
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
                            ) : !isStatusAllowed ? (
                              <Lock className="w-4 h-4 mr-1.5" />
                            ) : (
                              <Play className="w-4 h-4 mr-1.5 fill-current" />
                            )}
                            {!isStatusAllowed ? "🔒 Bloqueado para este Serviço" : "▶️ Iniciar Apartamento (2. Iniciar Serviço)"}
                          </Button>
                        </>
                      )}

                      {!canStart && (
                        <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium text-center px-1">
                          {disabledReason}
                        </p>
                      )}
                    </div>
                  )}

                  {flat.status === "in_progress" && (
                    <div className="w-full space-y-2">
                      <Button
                        onClick={() => handleOpenFinishModal(flat)}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-10 shadow-md flex items-center justify-center gap-1.5"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        🏁 Finalizar Serviço
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenEstimateModal(flat)}
                        className="w-full text-xs h-8 border-sky-300 text-sky-700 hover:bg-sky-50 dark:border-sky-800 dark:text-sky-300 dark:hover:bg-sky-950/40 flex items-center justify-center gap-1.5"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        ⏱️ Atualizar Previsão
                      </Button>
                    </div>
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

          {/* Form inside Dialog so the worker can fill right away without scrolling */}
          <div className="space-y-3 py-2 text-left">
            <div>
              <Label className="text-xs font-semibold">Nome Completo do Responsável *</Label>
              <Input
                placeholder="Ex: Carlos Pinturas"
                value={mainWorkerName}
                onChange={(e) => setMainWorkerName(e.target.value)}
                className="mt-1 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold">CPF do Responsável *</Label>
              <Input
                placeholder="000.000.000-00"
                value={mainWorkerCpf}
                onChange={(e) => setMainWorkerCpf(formatCpf(e.target.value))}
                maxLength={14}
                className="mt-1 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold">WhatsApp / Telefone para Contato *</Label>
              <Input
                placeholder="(22) 99850-5276"
                value={mainWorkerPhone}
                onChange={(e) => setMainWorkerPhone(e.target.value)}
                className="mt-1 text-sm"
              />
              <span className="text-[10px] text-muted-foreground block mt-0.5">
                Utilizado para avisos automáticos de previsão e liberação.
              </span>
            </div>
          </div>

          <DialogFooter className="mt-3 flex flex-col sm:flex-row gap-2">
            <Button
              onClick={async () => {
                const cleanCpf = cleanCpfDigits(mainWorkerCpf);
                if (!mainWorkerName.trim() || cleanCpf.length !== 11) {
                  toast({
                    title: "Campos obrigatórios",
                    description: "Preencha seu Nome completo e um CPF válido com 11 dígitos.",
                    variant: "destructive",
                  });
                  return;
                }
                try {
                  await registerMutation.mutateAsync();
                  setGuardDialogOpen(false);
                  if (pendingAction) {
                    const action = pendingAction;
                    setPendingAction(null);
                    if (action.type === "request_entry") {
                      handleRequestEntry(action.flat);
                    } else if (action.type === "start") {
                      handleStartFlatClick(action.flat);
                    }
                  }
                } catch (err: any) {
                  toast({
                    title: "Erro ao salvar identificação",
                    description: err.message || "Falha ao salvar identificação",
                    variant: "destructive",
                  });
                }
              }}
              disabled={registerMutation.isPending || !mainWorkerName.trim() || cleanCpfDigits(mainWorkerCpf).length !== 11}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs h-10 shadow-xs"
            >
              {registerMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
              ) : (
                <Check className="w-4 h-4 mr-1.5" />
              )}
              {pendingAction?.type === "request_entry" ? "Salvar Identificação e Solicitar Entrada" : "Salvar Identificação e Continuar"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setGuardDialogOpen(false);
                scrollToBanner();
              }}
              className="w-full text-xs h-9"
            >
              Preencher no Início da Página
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Mandatório de Confirmação: Quarto Ocupado por Hóspede */}
      <Dialog open={guestWarningModalOpen} onOpenChange={setGuestWarningModalOpen}>
        <DialogContent className="max-w-md rounded-2xl p-6">
          <DialogHeader className="space-y-3">
            <div className="w-12 h-12 bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400 rounded-2xl flex items-center justify-center mx-auto">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <DialogTitle className="text-center text-lg font-black text-slate-800 dark:text-slate-100">
              ⚠️ Atenção: Quarto Ocupado por Hóspede!
            </DialogTitle>
            <DialogDescription className="text-center text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
              Confirmação de segurança e protocolo de acesso CorpFlats
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-left">
            <div className="p-3.5 bg-amber-500/10 border border-amber-300 dark:border-amber-700 rounded-xl space-y-2">
              <p className="font-semibold text-amber-900 dark:text-amber-200 text-xs leading-relaxed">
                Este apartamento está com hóspede dentro. Certifique-se com a recepção de que o hóspede foi previamente comunicado do serviço e BATA NA PORTA antes de entrar.
              </p>
              <div className="text-[11px] text-amber-800 dark:text-amber-300 space-y-1 pt-1 border-t border-amber-200 dark:border-amber-800">
                <div>• Apartamento: <strong>Flat {guestWarningFlat?.flatNumber}</strong></div>
                <div>• Status operacional: <strong>{guestWarningFlat?.operationalScenarioLabel || "Hóspede no quarto"}</strong></div>
                <div>• A recepção receberá alerta em tempo real de que o quarto possui hóspede no momento da liberação.</div>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setGuestWarningModalOpen(false)}
              className="w-full sm:w-auto text-xs h-9"
            >
              Cancelar
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleConfirmGuestWarning}
              disabled={requestEntryMutation.isPending || startMutation.isPending}
              className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs h-9"
            >
              Estou Ciente, Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Start Flat Modal: Requires Estimated Finish Date & Time (Requirement 4) */}
      <Dialog open={startModalOpen} onOpenChange={setStartModalOpen}>
        <DialogContent className="max-w-md rounded-2xl p-6">
          <DialogHeader className="space-y-2">
            <DialogTitle className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Play className="w-5 h-5 text-primary fill-current" />
              Iniciar Flat {startingFlat?.flatNumber}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Informe a previsão de conclusão dos trabalhos para este apartamento. Caso ocorra atraso, você poderá atualizar a previsão.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="p-3 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-900 rounded-xl text-xs text-sky-900 dark:text-sky-200 space-y-1">
              <span className="font-bold block">Controle de Horário</span>
              <p className="text-[11px] leading-relaxed">
                A previsão de término ajuda a governança a organizar a liberação de entrada e inspeção dos apartamentos.
              </p>
            </div>

            <div>
              <Label className="text-xs font-bold text-slate-800 dark:text-slate-100">
                Previsão de Término (Data e Hora) *
              </Label>
              <Input
                type="datetime-local"
                value={estimatedFinishInput}
                onChange={(e) => setEstimatedFinishInput(e.target.value)}
                className="mt-1.5 text-sm"
              />
            </div>

            <div className="flex flex-wrap gap-1.5 pt-1">
              <span className="text-[11px] font-semibold text-muted-foreground self-center mr-1">Atalhos:</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const d = new Date(Date.now() + 3600000);
                  setEstimatedFinishInput(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
                }}
                className="h-7 text-xs px-2"
              >
                +1 hora
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const d = new Date(Date.now() + 7200000);
                  setEstimatedFinishInput(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
                }}
                className="h-7 text-xs px-2"
              >
                +2 horas
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const d = new Date(Date.now() + 14400000);
                  setEstimatedFinishInput(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
                }}
                className="h-7 text-xs px-2"
              >
                +4 horas
              </Button>
            </div>
          </div>

          <DialogFooter className="mt-4 flex flex-col-reverse sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setStartModalOpen(false)}
              className="text-xs h-10"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleConfirmStart}
              disabled={startMutation.isPending || !estimatedFinishInput}
              className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs h-10 shadow-xs"
            >
              {startMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
              ) : (
                <Play className="w-4 h-4 mr-1.5 fill-current" />
              )}
              Confirmar e Iniciar Serviço
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Estimate Modal (Requirement 4) */}
      <Dialog open={estimateModalOpen} onOpenChange={setEstimateModalOpen}>
        <DialogContent className="max-w-md rounded-2xl p-6">
          <DialogHeader className="space-y-2">
            <DialogTitle className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Clock className="w-5 h-5 text-sky-600" />
              Atualizar Previsão — Flat {estimatingFlat?.flatNumber}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Ajuste o novo horário previsto para o término do serviço. Os responsáveis e a portaria serão notificados automaticamente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-bold text-slate-800 dark:text-slate-100">
                Nova Previsão de Término (Data e Hora) *
              </Label>
              <Input
                type="datetime-local"
                value={newEstimateInput}
                onChange={(e) => setNewEstimateInput(e.target.value)}
                className="mt-1.5 text-sm"
              />
            </div>

            <div className="flex flex-wrap gap-1.5 pt-1">
              <span className="text-[11px] font-semibold text-muted-foreground self-center mr-1">Adicionar tempo:</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const base = newEstimateInput ? new Date(newEstimateInput).getTime() : Date.now();
                  const d = new Date(base + 1800000);
                  setNewEstimateInput(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
                }}
                className="h-7 text-xs px-2"
              >
                +30 min
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const base = newEstimateInput ? new Date(newEstimateInput).getTime() : Date.now();
                  const d = new Date(base + 3600000);
                  setNewEstimateInput(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
                }}
                className="h-7 text-xs px-2"
              >
                +1 hora
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const base = newEstimateInput ? new Date(newEstimateInput).getTime() : Date.now();
                  const d = new Date(base + 7200000);
                  setNewEstimateInput(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
                }}
                className="h-7 text-xs px-2"
              >
                +2 horas
              </Button>
            </div>
          </div>

          <DialogFooter className="mt-4 flex flex-col-reverse sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEstimateModalOpen(false)}
              className="text-xs h-10"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleConfirmUpdateEstimate}
              disabled={updateEstimateMutation.isPending || !newEstimateInput}
              className="flex-1 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs h-10 shadow-xs"
            >
              {updateEstimateMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
              ) : (
                <Check className="w-4 h-4 mr-1.5" />
              )}
              Confirmar Nova Previsão
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
