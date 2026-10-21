import React, { useState, useEffect, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { Shell } from "@/components/layout";
import { useGetMe } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import {
  Package,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  Camera,
  Plus,
  Minus,
  Sparkles,
  Calendar,
  User,
  Coffee,
  Check,
  X,
  History,
  Lock,
  ArrowRight,
  ShieldAlert,
  Info,
  Clock,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FileText
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";

export interface FlatStatusItem {
  flatNumber: string;
  colName?: string;
  status: "checkout_hoje" | "ocupado" | "livre";
  currentReservation?: {
    code: string;
    guestName: string;
    checkIn?: string;
    checkOut?: string;
    phone?: string;
  } | null;
  declaredAmount: number;
  lastInspection?: {
    id: string;
    inspectedAt: string;
    inspectorName?: string;
    status: "conforme" | "divergencia";
    hasDiscrepancy?: boolean;
    restockedItems?: any[];
    discrepancyTotalAmount?: number;
    notes?: string;
  } | null;
  defaultStock?: Array<{ productId: string; quantity: number }> | Record<string, number>;
}

export interface MinibarProduct {
  id: string;
  name: string;
  category: string;
  price: number;
  cost?: number;
  isCourtesy?: boolean;
  imageUrl?: string;
  defaultQuantity?: number;
}

export default function AnserveRestockPage() {
  const { data: user, isLoading: authLoading } = useGetMe();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();

  // Token / PIN auth state for quick access
  const [localToken, setLocalToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem("corpflats_anserve_token");
    } catch {
      return null;
    }
  });
  const [pinInput, setPinInput] = useState<string>("");
  const [pinSubmitting, setPinSubmitting] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  // Data state
  const [flats, setFlats] = useState<FlatStatusItem[]>([]);
  const [products, setProducts] = useState<MinibarProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<"todos" | "checkout_hoje" | "ocupado" | "livre">("todos");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals state
  const [conformeModalFlat, setConformeModalFlat] = useState<FlatStatusItem | null>(null);
  const [divergenciaModalFlat, setDivergenciaModalFlat] = useState<FlatStatusItem | null>(null);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [selectedFlatHistory, setSelectedFlatHistory] = useState<FlatStatusItem | null>(null);
  const [submittingInspection, setSubmittingInspection] = useState(false);

  // Conforme form state
  const [inspectorName, setInspectorName] = useState("");
  const [conformeNotes, setConformeNotes] = useState("");
  const [conformeCourtesyRestock, setConformeCourtesyRestock] = useState(true);

  // Divergência form state
  const [missingQuantities, setMissingQuantities] = useState<Record<string, number>>({});
  const [divergenceNotes, setDivergenceNotes] = useState("");
  const [capturedPhotos, setCapturedPhotos] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Expanded card state
  const [expandedFlat, setExpandedFlat] = useState<string | null>(null);

  // Determine authorized user
  const isAuthorizedRole = useMemo(() => {
    if (!user) return false;
    const r = user.role;
    return r === "dev" || r === "admin" || r === "anserve_gestor" || r === "anserve_repositora";
  }, [user]);

  const isAuthenticated = isAuthorizedRole || Boolean(localToken);

  // Handle URL query parameters (?token=... or ?pin=...)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const tokenParam = sp.get("token");
    const pinParam = sp.get("pin");

    if (tokenParam) {
      localStorage.setItem("corpflats_anserve_token", tokenParam);
      setLocalToken(tokenParam);
    } else if (pinParam) {
      handlePinSubmit(pinParam);
    }
  }, []);

  // Update default inspector name when user loads
  useEffect(() => {
    if (user?.name) {
      setInspectorName(user.name);
    } else if (!inspectorName) {
      setInspectorName("Repositora Anserve");
    }
  }, [user]);

  // Load flats and products
  const fetchData = async () => {
    try {
      setRefreshing(true);
      const headers: Record<string, string> = {};
      if (localToken) {
        headers["x-anserve-token"] = localToken;
      }

      const [resFlats, resProducts] = await Promise.all([
        fetch("/api/minibar/inspections/flats-status", { credentials: "include", headers }),
        fetch("/api/minibar/products", { credentials: "include", headers })
      ]);

      if (resFlats.ok) {
        const jsonFlats = await resFlats.json();
        if (jsonFlats.success && Array.isArray(jsonFlats.flats)) {
          setFlats(jsonFlats.flats);
        }
      }

      if (resProducts.ok) {
        const jsonProducts = await resProducts.json();
        if (jsonProducts.success && Array.isArray(jsonProducts.products)) {
          setProducts(jsonProducts.products);
        }
      }
    } catch (err) {
      console.error("[AnserveRestock] Erro ao carregar dados:", err);
      toast({
        title: "Erro de conexão",
        description: "Não foi possível sincronizar o status dos flats.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
    } else {
      setLoading(false);
    }
  }, [isAuthenticated, localToken]);

  // Handle PIN authentication submission
  const handlePinSubmit = async (pinValue?: string) => {
    const pin = pinValue || pinInput;
    if (!pin || pin.length < 4) return;
    setPinSubmitting(true);
    setPinError(null);

    try {
      const res = await fetch("/api/minibar/auth-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ pin })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        if (data.token) {
          localStorage.setItem("corpflats_anserve_token", data.token);
          setLocalToken(data.token);
        }
        toast({
          title: "Acesso liberado!",
          description: `Bem-vinda, ${data.user?.name || "Repositora"}!`
        });
        setPinInput("");
        fetchData();
      } else {
        setPinError(data.error || "PIN de acesso inválido.");
      }
    } catch (err: any) {
      setPinError(err.message || "Erro de rede ao validar PIN.");
    } finally {
      setPinSubmitting(false);
    }
  };

  // Numeric keypad button press
  const handleKeypadPress = (num: string) => {
    if (pinInput.length >= 4) return;
    const nextPin = pinInput + num;
    setPinInput(nextPin);
    if (nextPin.length === 4) {
      handlePinSubmit(nextPin);
    }
  };

  const handleKeypadBackspace = () => {
    setPinInput((prev) => prev.slice(0, -1));
    setPinError(null);
  };

  const handleKeypadClear = () => {
    setPinInput("");
    setPinError(null);
  };

  // Metrics calculation
  const stats = useMemo(() => {
    const total = flats.length;
    const checkoutHoje = flats.filter((f) => f.status === "checkout_hoje").length;
    const ocupados = flats.filter((f) => f.status === "ocupado").length;
    const livres = flats.filter((f) => f.status === "livre").length;
    return { total, checkoutHoje, ocupados, livres };
  }, [flats]);

  // Filtered flats list
  const filteredFlats = useMemo(() => {
    return flats
      .filter((f) => {
        // Status filter
        if (statusFilter !== "todos" && f.status !== statusFilter) return false;

        // Search query filter (flat number or guest name)
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchFlat = String(f.flatNumber).toLowerCase().includes(q);
          const matchGuest = f.currentReservation?.guestName?.toLowerCase().includes(q);
          const matchCode = f.currentReservation?.code?.toLowerCase().includes(q);
          return matchFlat || matchGuest || matchCode;
        }

        return true;
      })
      .sort((a, b) => {
        // Prioritize checkouts of the day first
        const order = { checkout_hoje: 0, ocupado: 1, livre: 2 };
        if (order[a.status] !== order[b.status]) {
          return order[a.status] - order[b.status];
        }
        return Number(a.flatNumber) - Number(b.flatNumber);
      });
  }, [flats, statusFilter, searchQuery]);

  // Photo capture for divergence
  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setCapturedPhotos((prev) => [...prev, reader.result as string]);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const removePhoto = (index: number) => {
    setCapturedPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  // Open "Conforme" modal
  const handleOpenConforme = (flat: FlatStatusItem) => {
    setConformeModalFlat(flat);
    setConformeNotes("");
    setConformeCourtesyRestock(true);
  };

  // Open "Apontar Divergência" modal
  const handleOpenDivergencia = (flat: FlatStatusItem) => {
    setDivergenciaModalFlat(flat);
    setMissingQuantities({});
    setDivergenceNotes("");
    setCapturedPhotos([]);
  };

  // Submit "Conforme" inspection
  const handleSubmitConforme = async () => {
    if (!conformeModalFlat) return;
    setSubmittingInspection(true);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (localToken) headers["x-anserve-token"] = localToken;

      // Construct restocked items
      const restockedItems: Array<{ productId: string; quantity: number; isCourtesy?: boolean }> = [];

      // Add courtesy items if selected (Nespresso, balas, amendoim)
      if (conformeCourtesyRestock) {
        const nespresso = products.find((p) => p.id.includes("nespresso") || p.name.toLowerCase().includes("nespresso"));
        if (nespresso) {
          restockedItems.push({ productId: nespresso.id, quantity: 2, isCourtesy: true });
        }
        const balas = products.find((p) => p.id.includes("bala") || p.name.toLowerCase().includes("bala"));
        if (balas) {
          restockedItems.push({ productId: balas.id, quantity: 4, isCourtesy: true });
        }
        const amendoim = products.find((p) => p.id.includes("amendoim") || p.name.toLowerCase().includes("amendoim"));
        if (amendoim) {
          restockedItems.push({ productId: amendoim.id, quantity: 1, isCourtesy: true });
        }
      }

      const res = await fetch("/api/minibar/inspections", {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({
          flatNumber: conformeModalFlat.flatNumber,
          reservationCode: conformeModalFlat.currentReservation?.code || "",
          inspectedBy: inspectorName || user?.name || "Repositora Anserve",
          status: "conforme",
          notes: conformeNotes,
          restockedItems
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast({
          title: "Vistoria concluída com sucesso! ✅",
          description: `Flat ${conformeModalFlat.flatNumber} inspecionado e conforme. Reposição registrada.`
        });
        setConformeModalFlat(null);
        fetchData();
      } else {
        toast({
          title: "Erro ao registrar vistoria",
          description: data.error || "Tente novamente.",
          variant: "destructive"
        });
      }
    } catch (err: any) {
      toast({
        title: "Erro de comunicação",
        description: err.message || "Falha na conexão com o servidor.",
        variant: "destructive"
      });
    } finally {
      setSubmittingInspection(false);
    }
  };

  // Submit "Divergência" inspection
  const handleSubmitDivergencia = async () => {
    if (!divergenciaModalFlat) return;

    const missingItemsList = Object.entries(missingQuantities)
      .filter(([_, qty]) => qty > 0)
      .map(([productId, quantity]) => ({ productId, quantity }));

    if (missingItemsList.length === 0) {
      toast({
        title: "Nenhum item selecionado",
        description: "Adicione ao menos um item faltante para registrar a divergência.",
        variant: "destructive"
      });
      return;
    }

    setSubmittingInspection(true);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (localToken) headers["x-anserve-token"] = localToken;

      // Construct restocked items (restock the missing ones plus courtesy)
      const restockedItems = missingItemsList.map((m) => ({
        productId: m.productId,
        quantity: m.quantity,
        isCourtesy: false
      }));

      // Add courtesy items
      const nespresso = products.find((p) => p.id.includes("nespresso") || p.name.toLowerCase().includes("nespresso"));
      if (nespresso) {
        restockedItems.push({ productId: nespresso.id, quantity: 2, isCourtesy: true });
      }

      const res = await fetch("/api/minibar/inspections", {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({
          flatNumber: divergenciaModalFlat.flatNumber,
          reservationCode: divergenciaModalFlat.currentReservation?.code || "",
          inspectedBy: inspectorName || user?.name || "Repositora Anserve",
          status: "divergencia",
          missingItems: missingItemsList,
          photos: capturedPhotos,
          notes: divergenceNotes,
          restockedItems
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast({
          title: "Divergência registrada! ⚠️",
          description: `Cobrança de R$ ${data.inspection?.discrepancyTotalAmount?.toFixed(2) || "0.00"} gerada. A Sofia no WhatsApp acionou o hóspede.`
        });
        setDivergenciaModalFlat(null);
        fetchData();
      } else {
        toast({
          title: "Erro ao registrar divergência",
          description: data.error || "Tente novamente.",
          variant: "destructive"
        });
      }
    } catch (err: any) {
      toast({
        title: "Erro de comunicação",
        description: err.message || "Falha na conexão com o servidor.",
        variant: "destructive"
      });
    } finally {
      setSubmittingInspection(false);
    }
  };

  // PIN Keypad Screen (if not logged in)
  if (!isAuthenticated && !authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col items-center">
          <div className="w-14 h-14 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center mb-4">
            <Package className="w-7 h-7" />
          </div>

          <h1 className="text-xl font-black text-center text-white">Portal da Repositora</h1>
          <p className="text-xs text-slate-400 text-center mt-1 mb-6">
            CorpFlats Soho Residence & Anserve. Digite seu PIN de 4 dígitos para acessar.
          </p>

          {/* PIN Dots Display */}
          <div className="flex items-center gap-3 mb-6">
            {[0, 1, 2, 3].map((index) => {
              const isFilled = pinInput.length > index;
              return (
                <div
                  key={index}
                  className={`w-4 h-4 rounded-full border-2 transition-all ${
                    isFilled
                      ? "bg-sky-400 border-sky-400 scale-110 shadow-lg shadow-sky-500/40"
                      : "border-slate-700 bg-slate-800/60"
                  }`}
                />
              );
            })}
          </div>

          {pinError && (
            <div className="w-full mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold text-center">
              {pinError}
            </div>
          )}

          {/* Keypad Numeric Matrix */}
          <div className="grid grid-cols-3 gap-3 w-full max-w-[260px] mb-4">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
              <button
                key={num}
                type="button"
                disabled={pinSubmitting}
                onClick={() => handleKeypadPress(num)}
                className="h-16 rounded-2xl bg-slate-800/80 hover:bg-slate-700/80 active:bg-sky-600 text-xl font-black transition-all border border-slate-700/50 shadow-sm"
              >
                {num}
              </button>
            ))}
            <button
              type="button"
              disabled={pinSubmitting}
              onClick={handleKeypadClear}
              className="h-16 rounded-2xl bg-slate-800/40 hover:bg-slate-700 text-xs font-bold text-slate-400 border border-slate-800 transition-all"
            >
              LIMPAR
            </button>
            <button
              type="button"
              disabled={pinSubmitting}
              onClick={() => handleKeypadPress("0")}
              className="h-16 rounded-2xl bg-slate-800/80 hover:bg-slate-700/80 active:bg-sky-600 text-xl font-black transition-all border border-slate-700/50 shadow-sm"
            >
              0
            </button>
            <button
              type="button"
              disabled={pinSubmitting}
              onClick={handleKeypadBackspace}
              className="h-16 rounded-2xl bg-slate-800/40 hover:bg-slate-700 text-xs font-bold text-slate-400 border border-slate-800 transition-all flex items-center justify-center"
            >
              ⌫
            </button>
          </div>

          <div className="mt-2 text-center">
            <span className="text-[11px] text-slate-500">
              Caso não saiba o PIN, solicite à supervisão Anserve.
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Shell>
      <div className="max-w-6xl mx-auto px-4 py-4 md:py-6 space-y-5 pb-24">
        {/* Top Header */}
        <div className="bg-card border border-border p-4 md:p-6 rounded-3xl shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg md:text-xl font-black text-foreground">
                  Portal da Repositora Anserve
                </h1>
                <Badge className="bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30 text-[10px] font-bold">
                  19 Flats Soho
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Conferência de frigobar, apontamento de divergências com fotos e reposição de estoque.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchData}
              disabled={refreshing}
              className="rounded-xl text-xs font-bold h-9"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </div>

        {/* Filter Pills & Stats */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant={statusFilter === "todos" ? "default" : "outline"}
              onClick={() => setStatusFilter("todos")}
              className="h-8 rounded-xl text-xs font-bold"
            >
              Todos ({stats.total})
            </Button>
            <Button
              size="sm"
              variant={statusFilter === "checkout_hoje" ? "default" : "outline"}
              onClick={() => setStatusFilter("checkout_hoje")}
              className="h-8 rounded-xl text-xs font-bold border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
            >
              🔴 Check-out Hoje ({stats.checkoutHoje})
            </Button>
            <Button
              size="sm"
              variant={statusFilter === "ocupado" ? "default" : "outline"}
              onClick={() => setStatusFilter("ocupado")}
              className="h-8 rounded-xl text-xs font-bold"
            >
              🔵 Ocupados ({stats.ocupados})
            </Button>
            <Button
              size="sm"
              variant={statusFilter === "livre" ? "default" : "outline"}
              onClick={() => setStatusFilter("livre")}
              className="h-8 rounded-xl text-xs font-bold"
            >
              🟢 Livres ({stats.livres})
            </Button>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar flat ou hóspede..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-9 text-xs rounded-xl"
            />
          </div>
        </div>

        {/* Priority Banner for Checkouts Today */}
        {stats.checkoutHoje > 0 && statusFilter !== "checkout_hoje" && (
          <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-2xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-bold text-red-600 dark:text-red-400">
              <AlertTriangle className="w-4 h-4 shrink-0 animate-bounce" />
              <span>
                Atenção: Existem <strong>{stats.checkoutHoje} flats com checkout previsto para hoje</strong> que exigem vistoria prioritária antes das 14:00!
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setStatusFilter("checkout_hoje")}
              className="rounded-xl text-[11px] font-bold h-7 bg-card shrink-0"
            >
              Ver Checkouts
            </Button>
          </div>
        )}

        {/* Flats Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-44 bg-muted/30 rounded-3xl animate-pulse border border-border" />
            ))}
          </div>
        ) : filteredFlats.length === 0 ? (
          <div className="bg-card border border-border rounded-3xl p-10 text-center space-y-3">
            <Package className="w-10 h-10 text-muted-foreground mx-auto" />
            <h3 className="text-sm font-bold text-foreground">Nenhum flat localizado</h3>
            <p className="text-xs text-muted-foreground">Tente alterar os filtros ou o termo de busca.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredFlats.map((flat) => {
              const isCheckout = flat.status === "checkout_hoje";
              const isOcupado = flat.status === "ocupado";
              const isLivre = flat.status === "livre";
              const isExpanded = expandedFlat === flat.flatNumber;

              return (
                <Card
                  key={flat.flatNumber}
                  className={`rounded-3xl border transition-all duration-200 overflow-hidden ${
                    isCheckout
                      ? "border-red-500/40 bg-red-500/5 shadow-md shadow-red-500/5"
                      : isOcupado
                      ? "border-blue-500/20 bg-card hover:border-blue-500/40"
                      : "border-border bg-card"
                  }`}
                >
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-black text-foreground">
                          Flat {flat.flatNumber}
                        </span>
                        {isCheckout && (
                          <Badge className="bg-red-600 text-white border-none text-[10px] font-black uppercase tracking-wider animate-pulse">
                            Check-out Hoje
                          </Badge>
                        )}
                        {isOcupado && (
                          <Badge className="bg-blue-600/10 text-blue-700 dark:text-blue-300 border-blue-500/20 text-[10px] font-bold">
                            Ocupado
                          </Badge>
                        )}
                        {isLivre && (
                          <Badge className="bg-emerald-600/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 text-[10px] font-bold">
                            Livre / Vago
                          </Badge>
                        )}
                      </div>

                      {flat.declaredAmount > 0 && (
                        <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[11px] font-black">
                          R$ {flat.declaredAmount.toFixed(2)} Pago
                        </Badge>
                      )}
                    </div>

                    {flat.currentReservation ? (
                      <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                        <span className="font-bold text-foreground truncate max-w-[170px]">
                          {flat.currentReservation.guestName}
                        </span>
                        <span className="font-mono text-[11px]">{flat.currentReservation.code}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground mt-0.5">Sem reserva ativa no momento</span>
                    )}
                  </CardHeader>

                  <CardContent className="p-4 pt-2 space-y-3">
                    {/* Consumo Declarado e Gabarito Resumo */}
                    <div className="p-3 rounded-2xl bg-muted/40 border border-border text-xs space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>Padrão no flat:</span>
                        <span className="font-semibold text-foreground">
                          {Array.isArray(flat.defaultStock) ? `${flat.defaultStock.length} itens cadastrados` : "Gabarito padrão"}
                        </span>
                      </div>

                      {flat.lastInspection && (
                        <div className="flex items-center justify-between text-[11px] pt-1 border-t border-border/50">
                          <span className="text-muted-foreground">Última vistoria:</span>
                          <span className={`font-bold ${flat.lastInspection.status === "conforme" ? "text-emerald-600" : "text-amber-600"}`}>
                            {flat.lastInspection.status === "conforme" ? "✅ Conforme" : "⚠️ Divergência"} (
                            {new Date(flat.lastInspection.inspectedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })})
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons for Repositora */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <Button
                        size="sm"
                        onClick={() => handleOpenConforme(flat)}
                        className="rounded-2xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white h-9 shadow-xs"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                        Conforme
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenDivergencia(flat)}
                        className="rounded-2xl text-xs font-bold border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 h-9"
                      >
                        <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                        Divergência
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Modal: Confirmar Vistoria Conforme */}
        <Dialog open={Boolean(conformeModalFlat)} onOpenChange={() => setConformeModalFlat(null)}>
          <DialogContent className="sm:max-w-md rounded-3xl p-6">
            <DialogHeader>
              <DialogTitle className="text-base font-black flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>Confirmar Conformidade — Flat {conformeModalFlat?.flatNumber}</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                Atesta que os itens consumidos conferem exatamente com o declarado pelo hóspede e repõe o estoque nominal.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2 text-xs">
              <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 space-y-1">
                <div className="font-bold">Sem divergência apurada!</div>
                <div className="text-[11px]">
                  O consumo confere com os pagamentos registrados. Ao confirmar, o sistema registrará a reposição dos itens pagos e das cortesias gratuitas.
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Responsável pela Vistoria</Label>
                <Input
                  value={inspectorName}
                  onChange={(e) => setInspectorName(e.target.value)}
                  className="h-9 text-xs rounded-xl"
                  placeholder="Nome da repositora"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 rounded-2xl bg-muted/40 border border-border">
                  <div className="space-y-0.5">
                    <span className="font-bold text-foreground">Repor Kit de Cortesias de Boas-Vindas</span>
                    <p className="text-[11px] text-muted-foreground">
                      2 Cápsulas Nespresso + Balas + Amendoim (Crédito CorpFlats ↔ Anserve).
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={conformeCourtesyRestock}
                    onChange={(e) => setConformeCourtesyRestock(e.target.checked)}
                    className="w-4 h-4 accent-primary rounded"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Observações (Opcional)</Label>
                <Textarea
                  placeholder="Ex: Frigobar limpo, gelando perfeitamente e 100% abastecido."
                  value={conformeNotes}
                  onChange={(e) => setConformeNotes(e.target.value)}
                  className="text-xs rounded-2xl resize-none min-h-[60px]"
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                variant="outline"
                onClick={() => setConformeModalFlat(null)}
                className="rounded-xl text-xs font-bold"
              >
                Cancelar
              </Button>
              <Button
                disabled={submittingInspection}
                onClick={handleSubmitConforme}
                className="rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {submittingInspection ? "Registrando..." : "Confirmar e Repor"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal: Apontar Divergência */}
        <Dialog open={Boolean(divergenciaModalFlat)} onOpenChange={() => setDivergenciaModalFlat(null)}>
          <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl p-6">
            <DialogHeader>
              <DialogTitle className="text-base font-black flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <span>Apontar Divergência — Flat {divergenciaModalFlat?.flatNumber}</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                Indique os itens consumidos que não foram declarados pelo hóspede. A IA Sofia cobrará cordialmente no WhatsApp.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs">
                <strong>Importante:</strong> Ao registrar, o sistema gera automaticamente uma cobrança pendente na reserva e a Sofia enviará mensagem com o link de pagamento por PIX/Cartão.
              </div>

              {/* Items Stepper Selection */}
              <div className="space-y-2">
                <Label className="text-xs font-bold">Itens Faltantes / Consumo Não Declarado:</Label>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {products
                    .filter((p) => !p.isCourtesy)
                    .map((prod) => {
                      const qty = missingQuantities[prod.id] || 0;
                      return (
                        <div
                          key={prod.id}
                          className="flex items-center justify-between p-2.5 rounded-2xl bg-muted/40 border border-border"
                        >
                          <div className="flex items-center gap-2.5">
                            {prod.imageUrl ? (
                              <img src={prod.imageUrl} alt={prod.name} className="w-8 h-8 rounded-lg object-cover" />
                            ) : (
                              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                                🧊
                              </div>
                            )}
                            <div>
                              <div className="font-bold text-xs text-foreground">{prod.name}</div>
                              <div className="text-[10px] text-muted-foreground">
                                R$ {Number(prod.price).toFixed(2)} cada
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              disabled={qty === 0}
                              onClick={() =>
                                setMissingQuantities((prev) => ({
                                  ...prev,
                                  [prod.id]: Math.max(0, qty - 1)
                                }))
                              }
                              className="h-7 w-7 rounded-lg"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </Button>
                            <span className="w-6 text-center font-bold text-xs">{qty}</span>
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              onClick={() =>
                                setMissingQuantities((prev) => ({
                                  ...prev,
                                  [prod.id]: qty + 1
                                }))
                              }
                              className="h-7 w-7 rounded-lg"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Photo Evidence Capture */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold">Foto do Frigobar (Evidência visual)</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-7 text-[11px] rounded-xl font-bold"
                  >
                    <Camera className="w-3.5 h-3.5 mr-1" />
                    Tirar Foto / Anexar
                  </Button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  onChange={handlePhotoCapture}
                  className="hidden"
                />

                {capturedPhotos.length > 0 && (
                  <div className="flex items-center gap-2 overflow-x-auto py-1">
                    {capturedPhotos.map((photo, i) => (
                      <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden border border-border shrink-0">
                        <img src={photo} alt={`Evidência ${i + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removePhoto(i)}
                          className="absolute top-1 right-1 bg-black/70 text-white rounded-full p-0.5 hover:bg-red-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Observações para Auditoria</Label>
                <Textarea
                  placeholder="Ex: Frigobar conferido no checkout com 2 cervejas a menos do que o pago."
                  value={divergenceNotes}
                  onChange={(e) => setDivergenceNotes(e.target.value)}
                  className="text-xs rounded-2xl resize-none min-h-[60px]"
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                variant="outline"
                onClick={() => setDivergenciaModalFlat(null)}
                className="rounded-xl text-xs font-bold"
              >
                Cancelar
              </Button>
              <Button
                disabled={submittingInspection}
                onClick={handleSubmitDivergencia}
                className="rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white"
              >
                {submittingInspection ? "Registrando..." : "Registrar Divergência"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Shell>
  );
}
