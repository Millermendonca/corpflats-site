import React, { useState, useEffect, useMemo, useRef } from "react";
import { Shell } from "@/components/layout";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
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
  Calendar,
  User,
  Users,
  Check,
  X,
  Clock
} from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
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

export interface DailyLaunchGroup {
  dateYmd: string;
  dateBr: string;
  items: Array<{
    itemKey?: string;
    orderId: string;
    launchDateYmd: string;
    launchDateBr: string;
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    isCourtesy?: boolean;
    paymentStatus: string;
    launchedByName?: string;
  }>;
  totalDayAmount: number;
  pendingDayAmount: number;
}

export interface CheckoutSummaryData {
  todayStr: string;
  doneCount: number;
  pendingCount: number;
  totalTodayCheckouts: number;
  doneCheckouts: Array<{
    flatNumber: string;
    guestName: string;
    checkoutTime: string;
    reservationCode: string;
  }>;
  pendingCheckouts: Array<{
    flatNumber: string;
    guestName: string;
    scheduledTime?: string;
    reservationCode: string;
  }>;
}

export interface FlatStatusItem {
  flatNumber: string;
  colName?: string;
  status: "checkout_hoje" | "ocupado" | "livre";
  isCheckedOut?: boolean;
  checkoutTime?: string;
  currentReservation?: {
    code: string;
    guestName: string;
    numGuests?: number;
    checkIn?: string;
    checkOut?: string;
    phone?: string;
    isCheckedOut?: boolean;
    checkoutTime?: string;
  } | null;
  declaredAmount: number;
  totalLaunchedAmount?: number;
  totalPaidAmount?: number;
  pendingBalance?: number;
  dailyLaunches?: DailyLaunchGroup[];
  declaredItemsByProduct?: Record<string, number>;
  lastInspection?: {
    id: string;
    inspectedAt: string;
    launchDate?: string;
    launchDateBr?: string;
    inspectorName?: string;
    status: string;
    isDailyLaunch?: boolean;
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

function getTodayYmdBr(): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function formatYmdToBr(ymd: string): string {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return ymd;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export default function AnserveRestockPage() {
  const { data: user, isLoading: authLoading } = useGetMe();
  const queryClient = useQueryClient();
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

  // Restockers list for selection on PIN screen & header switcher
  const [restockersList, setRestockersList] = useState<
    Array<{ id: number; username: string; name: string; hasIndividualPin?: boolean }>
  >([]);
  const [selectedRestockerId, setSelectedRestockerId] = useState<number | null>(() => {
    try {
      const savedId = localStorage.getItem("corpflats_anserve_user_id");
      return savedId ? Number(savedId) : null;
    } catch {
      return null;
    }
  });

  // Data state
  const [flats, setFlats] = useState<FlatStatusItem[]>([]);
  const [checkoutSummary, setCheckoutSummary] = useState<CheckoutSummaryData | null>(null);
  const [products, setProducts] = useState<MinibarProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<"todos" | "checkout_hoje" | "ocupado" | "livre">("todos");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals state
  const [semConsumoModalFlat, setSemConsumoModalFlat] = useState<FlatStatusItem | null>(null);
  const [launchModalFlat, setLaunchModalFlat] = useState<FlatStatusItem | null>(null);
  const [submittingInspection, setSubmittingInspection] = useState(false);

  // Inspector & "Sem Consumo" form state
  const [inspectorName, setInspectorName] = useState("");
  const [semConsumoNotes, setSemConsumoNotes] = useState("");
  const [semConsumoCourtesyRestock, setSemConsumoCourtesyRestock] = useState(true);

  // "Lançar Consumo do Dia" form state
  const [launchDateYmd, setLaunchDateYmd] = useState<string>(getTodayYmdBr());
  const [launchedQuantities, setLaunchedQuantities] = useState<Record<string, number>>({});
  const [launchCourtesyRestock, setLaunchCourtesyRestock] = useState<boolean>(true);
  const [launchNotes, setLaunchNotes] = useState("");
  const [capturedPhotos, setCapturedPhotos] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Determine authorized user
  const isAuthorizedRole = useMemo(() => {
    if (!user) return false;
    const r = user.role;
    return r === "dev" || r === "admin" || r === "anserve_gestor" || r === "anserve_repositora";
  }, [user]);

  const isAuthenticated = isAuthorizedRole || Boolean(localToken);

  // Fetch active restockers list so the PIN screen can show the selector
  const fetchRestockersList = async () => {
    try {
      const res = await fetch("/api/minibar/restockers-list");
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.restockers)) {
          setRestockersList(json.restockers);
          if (json.restockers.length === 1 && !selectedRestockerId) {
            setSelectedRestockerId(Number(json.restockers[0].id));
          }
        }
      }
    } catch {}
  };

  // Handle URL query parameters (?token=... or ?pin=...)
  useEffect(() => {
    fetchRestockersList();
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
    const savedName = typeof window !== "undefined" ? localStorage.getItem("corpflats_anserve_user_name") : null;
    if (savedName) {
      setInspectorName(savedName);
    } else if (user?.name) {
      setInspectorName(user.name);
    } else if (!inspectorName) {
      setInspectorName("Repositora Anserve");
    }
  }, [user]);

  // Load flats, checkout summary, and products
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
        if (jsonFlats.checkoutSummary) {
          setCheckoutSummary(jsonFlats.checkoutSummary);
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

    if (restockersList.length > 1 && !selectedRestockerId && pin === "1234") {
      setPinError("Por favor, selecione qual repositora está trabalhando na lista acima antes de digitar o PIN.");
      setPinInput("");
      return;
    }

    setPinSubmitting(true);
    setPinError(null);

    try {
      const res = await fetch("/api/minibar/auth-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          pin,
          userId: selectedRestockerId || (restockersList.length === 1 ? restockersList[0].id : undefined)
        })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        if (data.token) {
          localStorage.setItem("corpflats_anserve_token", data.token);
          setLocalToken(data.token);
        }
        if (data.user) {
          if (data.user.name) {
            localStorage.setItem("corpflats_anserve_user_name", data.user.name);
            setInspectorName(data.user.name);
          }
          if (data.user.id) {
            localStorage.setItem("corpflats_anserve_user_id", String(data.user.id));
            setSelectedRestockerId(Number(data.user.id));
          }
          if (data.user.username) {
            localStorage.setItem("corpflats_anserve_username", data.user.username);
          }
          queryClient.setQueryData(getGetMeQueryKey(), data.user);
        }
        toast({
          title: "Acesso liberado!",
          description: `Bem-vinda, ${data.user?.name || "Repositora"}!`
        });
        setPinInput("");
        fetchData();
      } else {
        setPinError(data.error || "PIN de acesso inválido.");
        setPinInput("");
      }
    } catch (err: any) {
      setPinError(err.message || "Erro de rede ao validar PIN.");
      setPinInput("");
    } finally {
      setPinSubmitting(false);
    }
  };

  // Trocar de repositora / bloquear tela por PIN
  const handleSwitchRestocker = async () => {
    try {
      localStorage.removeItem("corpflats_anserve_token");
      localStorage.removeItem("corpflats_anserve_user_name");
      localStorage.removeItem("corpflats_anserve_user_id");
      localStorage.removeItem("corpflats_anserve_username");
      if (user?.role === "anserve_repositora") {
        await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
        queryClient.setQueryData(getGetMeQueryKey(), null);
      }
    } catch {}
    setLocalToken(null);
    setPinInput("");
    setPinError(null);
    fetchRestockersList();
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
        if (statusFilter !== "todos" && f.status !== statusFilter) return false;

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
        const order = { checkout_hoje: 0, ocupado: 1, livre: 2 };
        if (order[a.status] !== order[b.status]) {
          return order[a.status] - order[b.status];
        }
        return Number(a.flatNumber) - Number(b.flatNumber);
      });
  }, [flats, statusFilter, searchQuery]);

  // Photo capture
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

  // Open "Sem Consumo / Repor" modal
  const handleOpenSemConsumo = (flat: FlatStatusItem) => {
    setSemConsumoModalFlat(flat);
    setSemConsumoNotes("");
    setSemConsumoCourtesyRestock(true);
  };

  // Open "Lançar Consumo do Dia" modal
  const handleOpenLaunchConsumo = (flat: FlatStatusItem) => {
    setLaunchModalFlat(flat);
    setLaunchDateYmd(getTodayYmdBr());
    setLaunchedQuantities({});
    setLaunchCourtesyRestock(true);
    setLaunchNotes("");
    setCapturedPhotos([]);
  };

  // Cálculo em tempo real do Lançamento Diário de Consumo
  const dailyLaunchCalculation = useMemo(() => {
    const nonCourtesyProducts = products.filter((p) => !p.isCourtesy);
    let totalUnits = 0;
    let totalAmount = 0;

    const rows = nonCourtesyProducts.map((prod) => {
      const price = Number(prod.price) || 0;
      const qty = Number(launchedQuantities[prod.id]) || 0;
      const subtotal = Number((qty * price).toFixed(2));
      totalUnits += qty;
      totalAmount += subtotal;
      return {
        product: prod,
        qty,
        subtotal
      };
    });

    return {
      rows,
      totalUnits,
      totalAmount: Number(totalAmount.toFixed(2))
    };
  }, [products, launchedQuantities]);

  // Submit "Sem Consumo / Repor Cortesias"
  const handleSubmitSemConsumo = async () => {
    if (!semConsumoModalFlat) return;
    setSubmittingInspection(true);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (localToken) headers["x-anserve-token"] = localToken;

      const restockedItems: Array<{ productId: string; quantity: number; isCourtesy?: boolean }> = [];

      if (semConsumoCourtesyRestock) {
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
          flatNumber: semConsumoModalFlat.flatNumber,
          reservationCode: semConsumoModalFlat.currentReservation?.code || "",
          inspectedBy: inspectorName || user?.name || "Repositora Anserve",
          inspectorId: selectedRestockerId || user?.id || undefined,
          status: "conforme",
          isDailyLaunch: false,
          launchDate: getTodayYmdBr(),
          notes: semConsumoNotes,
          restockedItems
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast({
          title: "Passagem registrada com sucesso! ✅",
          description: `Flat ${semConsumoModalFlat.flatNumber} conferido sem novo consumo pago.`
        });
        setSemConsumoModalFlat(null);
        fetchData();
      } else {
        toast({
          title: "Erro ao registrar passagem",
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

  // Submit "Lançar Consumo do Dia"
  const handleSubmitLaunchConsumo = async () => {
    if (!launchModalFlat) return;

    const consumedItemsList = dailyLaunchCalculation.rows
      .filter((r) => r.qty > 0)
      .map((r) => ({
        productId: r.product.id,
        quantity: r.qty
      }));

    if (consumedItemsList.length === 0) {
      toast({
        title: "Nenhum item selecionado",
        description: "Selecione a quantidade de ao menos 1 produto consumido hoje para lançar no flat.",
        variant: "destructive"
      });
      return;
    }

    setSubmittingInspection(true);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (localToken) headers["x-anserve-token"] = localToken;

      const restockedItems: Array<{ productId: string; quantity: number; isCourtesy?: boolean }> =
        consumedItemsList.map((it) => ({
          productId: it.productId,
          quantity: it.quantity,
          isCourtesy: false
        }));

      if (launchCourtesyRestock) {
        const nespresso = products.find((p) => p.id.includes("nespresso") || p.name.toLowerCase().includes("nespresso"));
        if (nespresso) {
          restockedItems.push({ productId: nespresso.id, quantity: 2, isCourtesy: true });
        }
      }

      const res = await fetch("/api/minibar/inspections", {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({
          flatNumber: launchModalFlat.flatNumber,
          reservationCode: launchModalFlat.currentReservation?.code || "",
          inspectedBy: inspectorName || user?.name || "Repositora Anserve",
          inspectorId: selectedRestockerId || user?.id || undefined,
          status: "lancamento_diario",
          isDailyLaunch: true,
          launchDate: launchDateYmd || getTodayYmdBr(),
          consumedItems: consumedItemsList,
          photos: capturedPhotos,
          notes: launchNotes,
          restockedItems
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast({
          title: `Consumo do dia ${formatYmdToBr(launchDateYmd)} lançado! ✅`,
          description: launchModalFlat.isCheckedOut
            ? `R$ ${dailyLaunchCalculation.totalAmount.toFixed(2)} lançado pós-checkout e link enviado ao WhatsApp do hóspede!`
            : `R$ ${dailyLaunchCalculation.totalAmount.toFixed(2)} adicionado ao extrato do Flat ${launchModalFlat.flatNumber}.`
        });
        setLaunchModalFlat(null);
        fetchData();
      } else {
        toast({
          title: "Erro ao lançar consumo",
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
          <div className="w-14 h-14 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center mb-3">
            <Package className="w-7 h-7" />
          </div>

          <h1 className="text-xl font-black text-center text-white">Portal da Repositora</h1>
          <p className="text-xs text-slate-400 text-center mt-1 mb-4">
            CorpFlats Soho Residence & Anserve. Selecione seu nome e digite seu PIN de 4 dígitos.
          </p>

          {/* Seletor de Funcionária */}
          {restockersList.length > 0 && (
            <div className="w-full mb-5 bg-slate-950/70 border border-slate-800 rounded-2xl p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-sky-400" />
                  Qual repositora está trabalhando hoje?
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/25">
                  {restockersList.length} {restockersList.length === 1 ? "cadastrada" : "cadastradas"}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-1.5 max-h-36 overflow-y-auto pr-0.5">
                {restockersList.map((staff) => {
                  const isSelected = Number(selectedRestockerId) === Number(staff.id);
                  return (
                    <button
                      key={staff.id}
                      type="button"
                      onClick={() => {
                        setSelectedRestockerId(Number(staff.id));
                        setPinError(null);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left text-xs font-bold transition-all border ${
                        isSelected
                          ? "bg-sky-500/20 border-sky-400 text-white shadow-sm"
                          : "bg-slate-900/80 border-slate-800 text-slate-300 hover:bg-slate-800"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black shrink-0 ${
                            isSelected ? "bg-sky-500 text-white" : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          {(staff.name || staff.username || "R").charAt(0).toUpperCase()}
                        </div>
                        <span className="truncate">{staff.name || staff.username}</span>
                      </div>
                      {isSelected ? (
                        <span className="text-[10px] font-black text-sky-300 flex items-center gap-1 shrink-0">
                          <Check className="w-3.5 h-3.5" /> Selecionada
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500 shrink-0">Toque para selecionar</span>
                      )}
                    </button>
                  );
                })}
              </div>

              <p className="text-[10px] text-slate-400 mt-2 leading-snug">
                📲 Ao fazer o 1º login do dia, o resumo de check-outs de hoje é enviado automaticamente para o WhatsApp de Trabalho das Repositoras!
              </p>
            </div>
          )}

          <div className="flex items-center gap-3 mb-5">
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
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg md:text-xl font-black text-foreground">
                  Lançamento Diário & Reposição — Anserve
                </h1>
                <Badge className="bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30 text-[10px] font-bold">
                  19 Flats Soho
                </Badge>
                <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[10px] font-bold">
                  👩‍💼 {inspectorName || user?.name || "Repositora Anserve"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Lance diariamente os itens consumidos em cada flat. O hóspede acompanha por dia no portal e paga após o check-out.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSwitchRestocker}
              className="rounded-xl text-xs font-bold h-9 border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
            >
              <Users className="w-3.5 h-3.5 mr-1.5" />
              Trocar Repositora / PIN
            </Button>
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

        {/* Painel Ao Vivo: Resumo de Check-outs de Hoje (Mesmo Resumo Enviado ao WhatsApp de Trabalho) */}
        {checkoutSummary && (() => {
          const doneCheckoutsList = Array.isArray(checkoutSummary.doneCheckouts)
            ? checkoutSummary.doneCheckouts
            : Array.isArray((checkoutSummary as any).checkedOutTodayList)
            ? (checkoutSummary as any).checkedOutTodayList
            : [];
          const pendingCheckoutsList = Array.isArray(checkoutSummary.pendingCheckouts)
            ? checkoutSummary.pendingCheckouts
            : Array.isArray((checkoutSummary as any).pendingCheckoutsTodayList)
            ? (checkoutSummary as any).pendingCheckoutsTodayList
            : [];
          const doneCount = checkoutSummary.doneCount ?? (checkoutSummary as any).checkedOutCount ?? doneCheckoutsList.length;
          const pendingCount = checkoutSummary.pendingCount ?? pendingCheckoutsList.length;

          return (
            <Card className="rounded-3xl border-border bg-card p-4 sm:p-5 space-y-3 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-sky-500" />
                  <h2 className="text-xs sm:text-sm font-black text-foreground">
                    Resumo de Check-outs de Hoje ({formatYmdToBr(checkoutSummary.todayStr)})
                  </h2>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[10px] font-bold">
                    ✅ Já saíram: {doneCount}
                  </Badge>
                  <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 text-[10px] font-bold">
                    ⏳ Faltam sair hoje: {pendingCount}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 space-y-1.5">
                  <span className="text-[11px] font-black text-emerald-700 dark:text-emerald-300 block">
                    ✅ Flats que JÁ fizeram check-out hoje ({doneCount}):
                  </span>
                  {doneCheckoutsList.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">Nenhum check-out concluído até o momento.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {doneCheckoutsList.map((c: any) => (
                        <span
                          key={`${c.flatNumber}-${c.reservationCode}`}
                          className="px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-[11px] font-bold text-emerald-800 dark:text-emerald-200"
                        >
                          Flat {c.flatNumber} • às {c.checkoutTime} ({(c.guestName || "Hóspede").split(" ")[0]})
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-3 rounded-2xl bg-amber-500/5 border border-amber-500/20 space-y-1.5">
                  <span className="text-[11px] font-black text-amber-700 dark:text-amber-300 block">
                    ⏳ Flats que FALTAM fazer check-out hoje ({pendingCount}):
                  </span>
                  {pendingCheckoutsList.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">
                      Todos os check-outs previstos para hoje já foram concluídos!
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {pendingCheckoutsList.map((c: any) => (
                        <span
                          key={`${c.flatNumber}-${c.reservationCode}`}
                          className="px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-[11px] font-bold text-amber-800 dark:text-amber-200"
                        >
                          Flat {c.flatNumber} ({(c.guestName || "Hóspede").split(" ")[0]})
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })()}

        {/* Filter Pills & Search */}
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
              const dailyGroups = Array.isArray(flat.dailyLaunches) ? flat.dailyLaunches : [];
              const pendingVal = Number(flat.pendingBalance) || 0;
              const paidVal = Number(flat.totalPaidAmount || flat.declaredAmount) || 0;

              return (
                <Card
                  key={flat.flatNumber}
                  className={`rounded-3xl border transition-all duration-200 overflow-hidden ${
                    flat.isCheckedOut
                      ? "border-emerald-500/40 bg-emerald-500/5"
                      : isCheckout
                      ? "border-red-500/40 bg-red-500/5 shadow-md shadow-red-500/5"
                      : isOcupado
                      ? "border-blue-500/20 bg-card hover:border-blue-500/40"
                      : "border-border bg-card"
                  }`}
                >
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base font-black text-foreground">
                          Flat {flat.flatNumber}
                        </span>
                        {flat.isCheckedOut ? (
                          <Badge className="bg-emerald-600 text-white border-none text-[10px] font-black">
                            ✓ Saiu {flat.checkoutTime ? `às ${flat.checkoutTime}` : "Hoje"}
                          </Badge>
                        ) : isCheckout ? (
                          <Badge className="bg-red-600 text-white border-none text-[10px] font-black uppercase tracking-wider animate-pulse">
                            Saída Hoje
                          </Badge>
                        ) : isOcupado ? (
                          <Badge className="bg-blue-600/10 text-blue-700 dark:text-blue-300 border-blue-500/20 text-[10px] font-bold">
                            Ocupado
                          </Badge>
                        ) : (
                          <Badge className="bg-emerald-600/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 text-[10px] font-bold">
                            Livre / Vago
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {paidVal > 0 && (
                          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[10px] font-black">
                            R$ {paidVal.toFixed(2)} Pago
                          </Badge>
                        )}
                        {pendingVal > 0 && (
                          <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 text-[10px] font-black">
                            R$ {pendingVal.toFixed(2)} A pagar
                          </Badge>
                        )}
                      </div>
                    </div>

                    {flat.currentReservation ? (
                      <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-bold text-foreground truncate max-w-[165px]">
                            {flat.currentReservation.guestName}
                          </span>
                          {(flat.currentReservation.numGuests || 1) > 1 && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 shrink-0">
                              <Users className="w-2.5 h-2.5 mr-0.5" />
                              {flat.currentReservation.numGuests} hósp.
                            </Badge>
                          )}
                        </div>
                        <span className="font-mono text-[11px] shrink-0">{flat.currentReservation.code}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground mt-0.5">Sem reserva ativa no momento</span>
                    )}
                  </CardHeader>

                  <CardContent className="p-4 pt-2 space-y-3">
                    {/* Lançamentos Diários Registrados no Flat */}
                    <div className="p-3 rounded-2xl bg-muted/40 border border-border text-xs space-y-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground font-bold flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-sky-500" />
                          Consumo lançado na estadia:
                        </span>
                        {dailyGroups.length > 0 ? (
                          <span className="font-black text-foreground">
                            R$ {Number(flat.totalLaunchedAmount || 0).toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Nenhum lançamento</span>
                        )}
                      </div>

                      {dailyGroups.length > 0 && (
                        <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                          {dailyGroups.map((g) => (
                            <div
                              key={g.dateYmd}
                              className="p-2 rounded-xl bg-background/80 border border-border/80 space-y-1"
                            >
                              <div className="flex items-center justify-between text-[10px] font-black text-sky-600 dark:text-sky-400">
                                <span>📅 Dia {g.dateBr}</span>
                                <span>R$ {Number(g.totalDayAmount || 0).toFixed(2)}</span>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {(Array.isArray(g.items) ? g.items : []).map((it, idx) => (
                                  <span
                                    key={`${it.orderId}-${it.productId}-${idx}`}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                      it.paymentStatus === "pago"
                                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                        : "bg-amber-500/15 text-amber-800 dark:text-amber-300"
                                    }`}
                                  >
                                    {it.quantity}x {it.productName}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {flat.lastInspection && (
                        <div className="flex items-center justify-between text-[11px] pt-1 border-t border-border/50">
                          <span className="text-muted-foreground">Última passagem:</span>
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">
                            ✓ {flat.lastInspection.launchDateBr ||
                              new Date(flat.lastInspection.inspectedAt).toLocaleDateString("pt-BR", {
                                day: "2-digit",
                                month: "2-digit"
                              })}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Botões de Ação da Repositora */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <Button
                        size="sm"
                        onClick={() => handleOpenLaunchConsumo(flat)}
                        className="rounded-2xl text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white h-9 shadow-xs"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        Lançar Consumo
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenSemConsumo(flat)}
                        className="rounded-2xl text-xs font-bold border-emerald-500/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 h-9"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                        Sem Consumo
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Modal 1: Registrar Passagem Sem Consumo Pago / Repor Cortesias */}
        <Dialog open={Boolean(semConsumoModalFlat)} onOpenChange={() => setSemConsumoModalFlat(null)}>
          <DialogContent className="sm:max-w-md rounded-3xl p-6">
            <DialogHeader>
              <DialogTitle className="text-base font-black flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>Passagem Sem Consumo — Flat {semConsumoModalFlat?.flatNumber}</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                Registra que você conferiu o frigobar hoje e não houve novo consumo de itens pagos.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2 text-xs">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Responsável pela Conferência</Label>
                <Input
                  value={inspectorName}
                  onChange={(e) => setInspectorName(e.target.value)}
                  className="h-9 text-xs rounded-xl"
                  placeholder="Nome da repositora"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-2xl bg-muted/40 border border-border">
                <div className="space-y-0.5">
                  <span className="font-bold text-foreground">Repor Kit de Cortesias de Boas-Vindas</span>
                  <p className="text-[11px] text-muted-foreground">
                    2 Cápsulas Nespresso + Balas + Amendoim (Crédito CorpFlats ↔ Anserve).
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={semConsumoCourtesyRestock}
                  onChange={(e) => setSemConsumoCourtesyRestock(e.target.checked)}
                  className="w-4 h-4 accent-primary rounded"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Observações (Opcional)</Label>
                <Textarea
                  placeholder="Ex: Frigobar conferido e abastecido."
                  value={semConsumoNotes}
                  onChange={(e) => setSemConsumoNotes(e.target.value)}
                  className="text-xs rounded-2xl resize-none min-h-[60px]"
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                variant="outline"
                onClick={() => setSemConsumoModalFlat(null)}
                className="rounded-xl text-xs font-bold"
              >
                Cancelar
              </Button>
              <Button
                disabled={submittingInspection}
                onClick={handleSubmitSemConsumo}
                className="rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {submittingInspection ? "Registrando..." : "Confirmar Passagem"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal 2: Lançar Consumo do Dia & Reposição */}
        <Dialog open={Boolean(launchModalFlat)} onOpenChange={() => setLaunchModalFlat(null)}>
          <DialogContent className="sm:max-w-xl max-h-[92vh] overflow-y-auto rounded-3xl p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle className="text-base font-black flex items-center gap-2">
                <Plus className="w-5 h-5 text-sky-600" />
                <span>Lançar Consumo do Dia — Flat {launchModalFlat?.flatNumber}</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                Selecione abaixo a quantidade consumida hoje em cada item. O lançamento fica visível para o hóspede com a <strong>data do dia</strong> (sem hora) e pronto para pagamento no check-out.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-1">
              {launchModalFlat?.currentReservation && (
                <div className="p-3 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-xs flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-bold text-foreground block">
                      Hóspede: {launchModalFlat.currentReservation.guestName} ({launchModalFlat.currentReservation.code})
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {launchModalFlat.isCheckedOut
                        ? "✅ Hóspede já fez check-out: ao salvar, a Sofia enviará automaticamente o link no WhatsApp para ele pagar!"
                        : "🏠 Hóspede no flat: os itens ficarão registrados no extrato do dia e liberados para pagamento no check-out."}
                    </span>
                  </div>
                </div>
              )}

              {/* Seletor de Data do Lançamento (Dia) */}
              <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-muted/50 border border-border">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-sky-500" />
                  <div>
                    <Label className="text-xs font-bold block">Data do Lançamento (Dia)</Label>
                    <span className="text-[10px] text-muted-foreground">
                      Aparecerá para o hóspede como Dia {formatYmdToBr(launchDateYmd)}
                    </span>
                  </div>
                </div>
                <Input
                  type="date"
                  value={launchDateYmd}
                  onChange={(e) => setLaunchDateYmd(e.target.value)}
                  className="w-40 h-9 text-xs font-bold rounded-xl"
                />
              </div>

              {/* Lista de Produtos para Lançar Quantidade Consumida no Dia */}
              <div className="border border-border rounded-2xl overflow-hidden bg-card">
                <div className="divide-y divide-border max-h-[42vh] overflow-y-auto">
                  {dailyLaunchCalculation.rows.map(({ product: prod, qty, subtotal }) => (
                    <div
                      key={prod.id}
                      className={`p-3 flex items-center justify-between gap-3 transition-colors ${
                        qty > 0 ? "bg-sky-500/10" : "bg-card"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-bold text-xs sm:text-sm text-foreground block truncate">
                          {prod.name}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          R$ {Number(prod.price).toFixed(2)} un. • Padrão no flat: <strong>{prod.defaultQuantity ?? 2} un.</strong>
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {qty > 0 && (
                          <span className="text-xs font-black font-mono text-sky-600 dark:text-sky-400 mr-1">
                            R$ {subtotal.toFixed(2)}
                          </span>
                        )}

                        <button
                          type="button"
                          disabled={qty <= 0}
                          onClick={() =>
                            setLaunchedQuantities((prev) => ({
                              ...prev,
                              [prod.id]: Math.max(0, qty - 1)
                            }))
                          }
                          className="w-8 h-8 rounded-xl bg-muted/70 hover:bg-muted active:scale-95 disabled:opacity-30 flex items-center justify-center text-foreground border border-border"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>

                        <span className="font-black text-sm text-foreground text-center min-w-[24px]">
                          {qty}
                        </span>

                        <button
                          type="button"
                          onClick={() =>
                            setLaunchedQuantities((prev) => ({
                              ...prev,
                              [prod.id]: qty + 1
                            }))
                          }
                          className="w-8 h-8 rounded-xl bg-sky-600 hover:bg-sky-500 text-white active:scale-95 flex items-center justify-center font-bold shadow-xs"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Rodapé Total do Dia */}
                <div className="bg-muted/90 border-t border-border p-3 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] text-muted-foreground font-bold block">
                      Total do Lançamento ({formatYmdToBr(launchDateYmd)}):
                    </span>
                    <span className="text-xs font-bold text-foreground">
                      {dailyLaunchCalculation.totalUnits} {dailyLaunchCalculation.totalUnits === 1 ? "item" : "itens"}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-base font-black font-mono text-sky-600 dark:text-sky-400">
                      R$ {dailyLaunchCalculation.totalAmount.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Repor Cortesias & Foto Opcional */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-muted/40 border border-border text-xs">
                <div>
                  <span className="font-bold text-foreground block">Repor Cortesias Consumidas</span>
                  <span className="text-[11px] text-muted-foreground">
                    Registrar reposição de cápsulas Nespresso / cortesias gratuitas
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={launchCourtesyRestock}
                  onChange={(e) => setLaunchCourtesyRestock(e.target.checked)}
                  className="w-4 h-4 accent-primary rounded"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold">Foto do Frigobar (Opcional)</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-7 text-[11px] rounded-xl font-bold"
                  >
                    <Camera className="w-3.5 h-3.5 mr-1" />
                    Tirar Foto
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
                        <img src={photo} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
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

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Observações (Opcional)</Label>
                <Textarea
                  placeholder="Ex: Reposição diária realizada."
                  value={launchNotes}
                  onChange={(e) => setLaunchNotes(e.target.value)}
                  className="text-xs rounded-2xl resize-none min-h-[52px]"
                />
              </div>
            </div>

            <DialogFooter className="pt-2 flex flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={() => setLaunchModalFlat(null)}
                className="rounded-xl text-xs font-bold"
              >
                Cancelar
              </Button>
              <Button
                disabled={submittingInspection || dailyLaunchCalculation.totalUnits === 0}
                onClick={handleSubmitLaunchConsumo}
                className="rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white"
              >
                {submittingInspection
                  ? "Salvando Lançamento..."
                  : `Salvar Lançamento do Dia (R$ ${dailyLaunchCalculation.totalAmount.toFixed(2)})`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Shell>
  );
}
