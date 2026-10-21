import React, { useState, useEffect, useMemo, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import {
  Refrigerator,
  Package,
  Plus,
  Minus,
  CheckCircle2,
  Copy,
  Check,
  CreditCard,
  QrCode,
  AlertTriangle,
  RefreshCw,
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Building2,
  Lock,
  Coffee,
  CheckCircle,
  ExternalLink,
  Receipt,
  FileText,
  Mail,
  Home,
  AlertCircle,
  Clock,
  Sparkle
} from "lucide-react";

export interface MinibarProduct {
  id: string;
  name: string;
  category: string;
  price: number;
  description?: string;
  imageUrl?: string;
  isCourtesy?: boolean;
  courtesyLimit?: number;
  extraPaidProductId?: string;
  defaultQuantity?: number;
  sortOrder?: number;
}

export interface MinibarOrderItem {
  productId: string;
  productName?: string;
  quantity: number;
  unitPrice?: number;
  totalPrice?: number;
  isCourtesy?: boolean;
}

export interface MinibarReservation {
  guestName: string;
  firstName: string;
  phone?: string;
  email?: string;
  document?: string;
  reservationCode: string;
  reservationId?: number | string;
  flatNumber: string;
  checkIn?: string;
  checkOut?: string;
  status?: string;
}

export type InvoicePreference = "detailed" | "water" | "minibar_consumption";

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
}

function formatDocMask(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 11) {
    // CPF: 000.000.000-00
    return digits
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  } else {
    // CNPJ: 00.000.000/0000-00
    return digits
      .slice(0, 14)
      .replace(/(\d{2})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1/$2")
      .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
  }
}

export default function GuestMinibar() {
  const [, setLocation] = useLocation();

  // Rotas por QR Code no Flat
  const [, paramsFlatDirect] = useRoute("/frigobar/flat/:flatNumber");
  const [, paramsFlatShort] = useRoute("/frigobar/:flatNumber");
  const [, paramsMinibarFlatDirect] = useRoute("/minibar/flat/:flatNumber");
  const [, paramsMinibarFlatShort] = useRoute("/minibar/:flatNumber");

  // Rotas Diretas pela Reserva
  const [, paramsResCodeFrigobar] = useRoute("/minha-reserva/:code/frigobar");
  const [, paramsResCodeMinibar] = useRoute("/minha-reserva/:code/minibar");
  const [, paramsPortalFrigobar] = useRoute("/portal-hospede/:code/frigobar");
  const [, paramsGuestFrigobar] = useRoute("/guest-portal/:code/frigobar");

  // Identificação dos Parâmetros
  const flatFromUrl =
    paramsFlatDirect?.flatNumber ||
    paramsFlatShort?.flatNumber ||
    paramsMinibarFlatDirect?.flatNumber ||
    paramsMinibarFlatShort?.flatNumber ||
    "";

  const codeFromUrl =
    paramsResCodeFrigobar?.code ||
    paramsResCodeMinibar?.code ||
    paramsPortalFrigobar?.code ||
    paramsGuestFrigobar?.code ||
    "";

  // Estados de Etapa
  const [step, setStep] = useState<"loading" | "otp_gate" | "manual_lookup" | "catalog" | "checkout" | "payment" | "success">("loading");

  // Contexto da Reserva e Catálogo
  const [reservation, setReservation] = useState<MinibarReservation | null>(null);
  const [catalog, setCatalog] = useState<MinibarProduct[]>([]);
  const [defaultStock, setDefaultStock] = useState<Record<string, number>>({});
  const [paidItems, setPaidItems] = useState<MinibarOrderItem[]>([]);
  const [courtesyConsumed, setCourtesyConsumed] = useState(false);

  // Estados do Portão OTP (4 Dígitos)
  const [otpValue, setOtpValue] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);

  // Busca Manual (quando entra em /frigobar sem flat e sem code)
  const [manualInput, setManualInput] = useState("");
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  // Filtro de Categorias no Catálogo
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  // Carrinho de Consumo: { productId: quantity }
  const [cart, setCart] = useState<Record<string, number>>({});

  // Formulário Fiscal
  const [invoicePreference, setInvoicePreference] = useState<InvoicePreference>("detailed");
  const [docChoice, setDocChoice] = useState<"cadastrado" | "personalizado">("cadastrado");
  const [customDocument, setCustomDocument] = useState("");
  const [customCompanyName, setCustomCompanyName] = useState("");
  const [invoiceEmail, setInvoiceEmail] = useState("");

  // Pagamento
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "credit_card">("pix");
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [activeOrder, setActiveOrder] = useState<any | null>(null);
  const [copiedPix, setCopiedPix] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<"pendente" | "pago" | "falha">("pendente");

  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Carrega contexto direto por código de reserva
  const loadContextByReservationCode = async (code: string) => {
    setStep("loading");
    setOtpError(null);
    try {
      const res = await fetch(`/api/minibar/reservation-context/${encodeURIComponent(code)}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setReservation({
          guestName: data.guestName,
          firstName: data.firstName || data.guestName?.split(" ")[0] || "Hóspede",
          phone: data.phone,
          email: data.email,
          document: data.document,
          reservationCode: data.reservationCode || code,
          reservationId: data.reservationId,
          flatNumber: String(data.flatNumber || ""),
          checkIn: data.checkIn,
          checkOut: data.checkOut,
          status: data.status
        });
        setCatalog(data.catalog || []);
        setDefaultStock(data.defaultStock || {});
        setPaidItems(data.paidItems || []);
        setCourtesyConsumed(Boolean(data.courtesyConsumed));
        setInvoiceEmail(data.email || "");
        if (data.document) {
          setCustomDocument(formatDocMask(data.document));
        }
        setStep("catalog");
      } else {
        setOtpError(data.error || "Reserva não encontrada ou encerrada.");
        setStep("manual_lookup");
      }
    } catch {
      setOtpError("Erro de comunicação ao carregar os dados da reserva.");
      setStep("manual_lookup");
    }
  };

  // Carrega contexto por flat e 4 dígitos (OTP)
  const verifyFlatContextWithDigits = async (flatNum: string, digits: string) => {
    if (digits.length !== 4) return;
    setOtpLoading(true);
    setOtpError(null);

    try {
      const res = await fetch("/api/minibar/flat-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatNumber: flatNum,
          last4Digits: digits
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setReservation({
          guestName: data.guestName,
          firstName: data.firstName || data.guestName?.split(" ")[0] || "Hóspede",
          phone: data.phone,
          email: data.email,
          document: data.document,
          reservationCode: data.reservationCode,
          reservationId: data.reservationId,
          flatNumber: String(data.flatNumber || flatNum),
          checkIn: data.checkIn,
          checkOut: data.checkOut,
          status: data.status
        });
        setCatalog(data.catalog || []);
        setDefaultStock(data.defaultStock || {});
        setPaidItems(data.paidItems || []);
        setCourtesyConsumed(Boolean(data.courtesyConsumed));
        setInvoiceEmail(data.email || "");
        if (data.document) {
          setCustomDocument(formatDocMask(data.document));
        }

        // Armazena no sessionStorage para não pedir os 4 dígitos a cada reload da aba
        try {
          sessionStorage.setItem(
            `gfm_minibar_auth_${flatNum}`,
            JSON.stringify({
              flatNumber: flatNum,
              reservationCode: data.reservationCode,
              last4Digits: digits,
              authAt: Date.now()
            })
          );
        } catch (_) {}

        setStep("catalog");
      } else {
        if (res.status === 401) {
          setOtpError(data.error || "Os 4 dígitos não coincidem com o celular ou documento cadastrado no flat.");
        } else if (res.status === 404) {
          setOtpError(data.error || `Nenhuma reserva ativa ou recente encontrada para o Flat ${flatNum}.`);
        } else {
          setOtpError(data.error || "Erro ao validar contexto do flat.");
        }
      }
    } catch {
      setOtpError("Falha na conexão ao validar os dígitos. Verifique sua internet.");
    } finally {
      setOtpLoading(false);
    }
  };

  // Inicialização Baseada na URL
  useEffect(() => {
    if (codeFromUrl) {
      loadContextByReservationCode(codeFromUrl);
    } else if (flatFromUrl) {
      // Checa se já temos sessão salva no sessionStorage para este flat
      let cachedAuth: any = null;
      try {
        const stored = sessionStorage.getItem(`gfm_minibar_auth_${flatFromUrl}`);
        if (stored) {
          cachedAuth = JSON.parse(stored);
        }
      } catch (_) {}

      if (cachedAuth?.reservationCode) {
        loadContextByReservationCode(cachedAuth.reservationCode);
      } else if (cachedAuth?.last4Digits) {
        verifyFlatContextWithDigits(flatFromUrl, cachedAuth.last4Digits);
      } else {
        setStep("otp_gate");
      }
    } else {
      setStep("manual_lookup");
    }
  }, [codeFromUrl, flatFromUrl]);

  // Limpeza de timers ao desmontar componente
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, []);

  // Polling de Pagamento
  const startPaymentPolling = (orderId: string) => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }

    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/minibar/orders/${encodeURIComponent(orderId)}/status`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && (data.status === "pago" || data.status === "paid")) {
          setPaymentStatus("pago");
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          setStep("success");
        }
      } catch (_) {}
    }, 2500);
  };

  // Funções de manipulação do carrinho
  const handleUpdateQuantity = (productId: string, delta: number) => {
    setCart((prev) => {
      const current = prev[productId] || 0;
      const next = Math.max(0, current + delta);
      if (next === 0) {
        const nextCart = { ...prev };
        delete nextCart[productId];
        return nextCart;
      }
      return { ...prev, [productId]: next };
    });
  };

  // Cálculos de totais
  const { totalQuantity, totalAmount, selectedItemsList } = useMemo(() => {
    let qty = 0;
    let sum = 0;
    const items: { product: MinibarProduct; quantity: number; subtotal: number }[] = [];

    for (const [prodId, count] of Object.entries(cart)) {
      if (count <= 0) continue;
      const prod = catalog.find((p) => p.id === prodId);
      if (!prod) continue;

      qty += count;
      let unitVal = prod.price;
      // Se for cortesia gratuita
      if (prod.isCourtesy && !courtesyConsumed) {
        unitVal = 0;
      }
      const itemSubtotal = unitVal * count;
      sum += itemSubtotal;
      items.push({
        product: prod,
        quantity: count,
        subtotal: itemSubtotal
      });
    }

    return {
      totalQuantity: qty,
      totalAmount: sum,
      selectedItemsList: items
    };
  }, [cart, catalog, courtesyConsumed]);

  // Categorias disponíveis no catálogo
  const categoriesList = useMemo(() => {
    const cats = new Set<string>();
    catalog.forEach((p) => {
      if (p.category) cats.add(p.category);
    });
    return Array.from(cats);
  }, [catalog]);

  // Produtos filtrados por categoria
  const filteredProducts = useMemo(() => {
    if (selectedCategory === "all") return catalog;
    return catalog.filter((p) => p.category === selectedCategory);
  }, [catalog, selectedCategory]);

  // Submissão do Pedido no Checkout
  const handleCheckoutSubmit = async () => {
    if (selectedItemsList.length === 0) {
      setOrderError("Selecione ao menos um item consumido.");
      return;
    }

    setIsSubmittingOrder(true);
    setOrderError(null);

    const docToSend =
      docChoice === "cadastrado"
        ? (reservation?.document || "").replace(/\D/g, "")
        : customDocument.replace(/\D/g, "");

    const orderPayload = {
      reservationCode: reservation?.reservationCode || codeFromUrl,
      flatNumber: reservation?.flatNumber || flatFromUrl,
      items: selectedItemsList.map((i) => ({
        productId: i.product.id,
        quantity: i.quantity
      })),
      paymentMethod,
      invoicePreference,
      document: docToSend,
      documentType: docToSend.length === 14 ? "cnpj" : "cpf",
      email: invoiceEmail.trim(),
      companyName: customCompanyName.trim()
    };

    try {
      const res = await fetch("/api/minibar/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderPayload)
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setOrderError(data.error || "Falha ao registrar pedido de frigobar.");
        setIsSubmittingOrder(false);
        return;
      }

      setActiveOrder(data);

      // Se for pedido exclusivamente de cortesia de boas-vindas gratuita (R$ 0.00)
      if (data.isCourtesyOnly || data.totalAmount === 0 || data.paymentStatus === "pago") {
        setPaymentStatus("pago");
        setStep("success");
        setIsSubmittingOrder(false);
        return;
      }

      // Se for Cartão de Crédito
      if (paymentMethod === "credit_card") {
        setPaymentStatus("pendente");
        setStep("payment");
        startPaymentPolling(data.orderId);
        if (data.initPoint) {
          window.open(data.initPoint, "_blank");
        }
      } else {
        // PIX
        setPaymentStatus("pendente");
        setStep("payment");
        startPaymentPolling(data.orderId);
      }
    } catch {
      setOrderError("Erro de comunicação ao criar pedido. Tente novamente.");
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  // Copiar código PIX
  const handleCopyPix = () => {
    const pixCode = activeOrder?.pixCopiaECola || activeOrder?.pixQrCode;
    if (!pixCode) return;
    navigator.clipboard.writeText(pixCode).then(() => {
      setCopiedPix(true);
      setTimeout(() => setCopiedPix(false), 3000);
    });
  };

  // Retorno visual de categoria amigável
  const getCategoryLabel = (cat: string) => {
    const map: Record<string, string> = {
      agua: "Água & Hidratação",
      bebidas: "Refrigerantes & Sucos",
      refrigerante: "Refrigerantes & Sucos",
      cerveja: "Cervejas & Vinhos",
      cervejas_vinhos: "Cervejas & Vinhos",
      snack: "Snacks & Doces",
      snacks: "Snacks & Doces",
      cafe: "Cafés & Chás",
      cafe_capsulas: "Cafés Nespresso",
      cortesia: "Cortesias Inclusas"
    };
    return map[cat] || cat.charAt(0).toUpperCase() + cat.slice(1);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. TELA: LOADING INICIAL
  // ─────────────────────────────────────────────────────────────────────────────
  if (step === "loading") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
        <div className="w-16 h-16 rounded-3xl bg-cyan-950/80 border border-cyan-800/60 flex items-center justify-center mb-4 text-cyan-400 shadow-xl shadow-cyan-950/50 animate-pulse">
          <Refrigerator className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-white mb-2">Frigobar & Autoatendimento</h1>
        <p className="text-xs text-slate-400 text-center max-w-xs mb-6">
          Carregando catálogo e disponibilidade do flat...
        </p>
        <div className="flex items-center gap-2 text-cyan-400 text-xs font-semibold">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span>Autenticando...</span>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. TELA: PORTÃO OTP DE 4 DÍGITOS (Acesso por QR Code no Flat)
  // ─────────────────────────────────────────────────────────────────────────────
  if (step === "otp_gate") {
    const flatDisplay = flatFromUrl || "do Flat";

    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6">
        <Card className="w-full max-w-md bg-slate-900/95 border-slate-800 shadow-2xl rounded-3xl backdrop-blur-xl p-6 sm:p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-600 to-cyan-400 text-slate-950 flex items-center justify-center mx-auto shadow-lg shadow-cyan-500/20">
              <Refrigerator className="w-8 h-8" />
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-950/80 border border-cyan-800/80 text-cyan-400 text-xs font-bold mt-2">
              <Sparkles className="w-3.5 h-3.5" />
              <span>CorpFlats Soho Residence</span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight pt-1">
              Frigobar Flat {flatDisplay}
            </h1>
            <p className="text-xs text-slate-400 leading-relaxed px-2">
              Para liberar o cardápio e registrar seu consumo com segurança, informe os <strong>4 últimos dígitos</strong> do celular ou documento cadastrado na reserva.
            </p>
          </div>

          <div className="space-y-4 pt-2">
            <div className="flex flex-col items-center justify-center space-y-3">
              <Label className="text-xs text-slate-300 font-semibold tracking-wide uppercase">
                4 Últimos Dígitos do Celular ou CPF
              </Label>
              <InputOTP
                maxLength={4}
                value={otpValue}
                onChange={(val) => {
                  setOtpValue(val);
                  setOtpError(null);
                  if (val.length === 4) {
                    verifyFlatContextWithDigits(flatFromUrl, val);
                  }
                }}
                disabled={otpLoading}
                containerClassName="justify-center"
              >
                <InputOTPGroup className="gap-2.5">
                  <InputOTPSlot index={0} className="w-12 h-14 text-xl font-black bg-slate-800/90 border-slate-700 text-cyan-400 rounded-xl" />
                  <InputOTPSlot index={1} className="w-12 h-14 text-xl font-black bg-slate-800/90 border-slate-700 text-cyan-400 rounded-xl" />
                  <InputOTPSlot index={2} className="w-12 h-14 text-xl font-black bg-slate-800/90 border-slate-700 text-cyan-400 rounded-xl" />
                  <InputOTPSlot index={3} className="w-12 h-14 text-xl font-black bg-slate-800/90 border-slate-700 text-cyan-400 rounded-xl" />
                </InputOTPGroup>
              </InputOTP>
            </div>

            {otpError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-xs text-rose-300 flex items-start gap-2.5 animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{otpError}</span>
              </div>
            )}

            <Button
              onClick={() => verifyFlatContextWithDigits(flatFromUrl, otpValue)}
              disabled={otpValue.length !== 4 || otpLoading}
              className="w-full h-12 bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-slate-950 font-bold rounded-2xl shadow-lg shadow-cyan-600/20 text-sm transition-all flex items-center justify-center gap-2"
            >
              {otpLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Validando Reserva...</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Abrir Frigobar</span>
                  <ArrowRight className="w-4 h-4 ml-1" />
                </>
              )}
            </Button>
          </div>

          <div className="border-t border-slate-800/80 pt-4 text-center">
            <button
              onClick={() => setStep("manual_lookup")}
              className="text-xs text-cyan-400 hover:underline inline-flex items-center gap-1 font-medium"
            >
              <span>Não é o Flat {flatDisplay}? Digitar outro código de reserva</span>
            </button>
          </div>
        </Card>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. TELA: BUSCA MANUAL (Se entrou em /frigobar sem parâmetros de flat ou código)
  // ─────────────────────────────────────────────────────────────────────────────
  if (step === "manual_lookup") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6">
        <Card className="w-full max-w-md bg-slate-900/95 border-slate-800 shadow-2xl rounded-3xl p-6 sm:p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-cyan-600/20 border border-cyan-500/30 text-cyan-400 flex items-center justify-center mx-auto">
              <Refrigerator className="w-7 h-7" />
            </div>
            <h1 className="text-xl font-black text-white">Localizar Frigobar</h1>
            <p className="text-xs text-slate-400">
              Digite o número do seu Flat (ex: 204) ou o código da sua reserva (ex: RES-605) para acessar o cardápio.
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300 font-semibold">Número do Flat ou Código da Reserva</Label>
              <Input
                placeholder="Ex: 204 ou RES-605"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                className="h-12 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 rounded-xl"
              />
            </div>

            {manualError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{manualError}</span>
              </div>
            )}

            <Button
              onClick={() => {
                const val = manualInput.trim();
                if (!val) {
                  setManualError("Por favor, digite o número do flat ou o código.");
                  return;
                }
                if (val.toUpperCase().startsWith("RES-") || val.length >= 6) {
                  loadContextByReservationCode(val);
                } else {
                  // É número de flat
                  setLocation(`/frigobar/flat/${val}`);
                }
              }}
              className="w-full h-12 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-xl"
            >
              <span>Acessar Frigobar</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. TELA: CATÁLOGO DE PRODUTOS & GABARITO INFORMATIVO
  // ─────────────────────────────────────────────────────────────────────────────
  if (step === "catalog") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 pb-32">
        {/* Topo / Header Mobile */}
        <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-3 sm:px-6">
          <div className="max-w-xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-cyan-600/20 border border-cyan-500/30 text-cyan-400 flex items-center justify-center shrink-0">
                <Refrigerator className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-sm sm:text-base font-black text-white leading-tight">
                    Frigobar Flat {reservation?.flatNumber}
                  </h1>
                  <Badge variant="outline" className="bg-cyan-950/60 text-cyan-300 border-cyan-800/80 text-[10px] font-bold">
                    Autoatendimento
                  </Badge>
                </div>
                <p className="text-xs text-slate-400">
                  Olá, <strong className="text-white">{reservation?.firstName || "Hóspede"}</strong>! 👋
                </p>
              </div>
            </div>

            {reservation?.reservationCode && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation(`/minha-reserva/${reservation.reservationCode}`)}
                className="text-xs text-slate-400 hover:text-white rounded-xl h-9 px-2.5"
              >
                <Home className="w-4 h-4 mr-1" />
                <span className="hidden sm:inline">Portal</span>
              </Button>
            )}
          </div>
        </header>

        <main className="max-w-xl mx-auto p-4 sm:p-6 space-y-5">
          {/* ── Aviso Mandatório de Desacoplamento Financeiro ── */}
          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-start gap-3 shadow-sm">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-200/90 leading-relaxed space-y-1">
              <p className="font-bold text-amber-300">Aviso importante:</p>
              <p>
                O consumo de frigobar é um serviço independente e não pode ser faturado junto com a diária de hospedagem.
              </p>
            </div>
          </div>

          {/* ── Seção de Itens já Pagos na mesma reserva (se houver) ── */}
          {paidItems.length > 0 && (
            <Card className="bg-slate-900/60 border-slate-800/80 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-slate-200">
                    Itens já pagos nesta estadia ({paidItems.reduce((acc, it) => acc + it.quantity, 0)} un.)
                  </span>
                </div>
                <Badge variant="outline" className="bg-emerald-950/60 text-emerald-300 border-emerald-800 text-[10px]">
                  ✓ Quitado
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
                {paidItems.map((it, idx) => (
                  <div key={idx} className="p-2.5 rounded-xl bg-slate-800/50 border border-slate-750 flex items-center justify-between">
                    <span className="truncate pr-1">{it.productName || it.productId}</span>
                    <strong className="text-emerald-400 shrink-0">{it.quantity}x</strong>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 italic">
                * Os itens acima já foram quitados e não constam na cobrança de novos consumos.
              </p>
            </Card>
          )}

          {/* ── Filtro de Categorias ── */}
          {categoriesList.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              <button
                onClick={() => setSelectedCategory("all")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                  selectedCategory === "all"
                    ? "bg-cyan-600 text-slate-950 shadow-md shadow-cyan-600/20"
                    : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
                }`}
              >
                Todos ({catalog.length})
              </button>
              {categoriesList.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                    selectedCategory === cat
                      ? "bg-cyan-600 text-slate-950 shadow-md shadow-cyan-600/20"
                      : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
                  }`}
                >
                  {getCategoryLabel(cat)}
                </button>
              ))}
            </div>
          )}

          {/* ── Lista de Produtos do Frigobar ── */}
          <div className="space-y-3">
            {filteredProducts.map((prod) => {
              const currentQty = cart[prod.id] || 0;
              const nominalStandard = defaultStock[prod.id] ?? prod.defaultQuantity ?? 0;
              const isCourtesyFree = Boolean(prod.isCourtesy && !courtesyConsumed);

              return (
                <Card
                  key={prod.id}
                  className={`bg-slate-900 border transition-all rounded-2xl overflow-hidden ${
                    currentQty > 0
                      ? "border-cyan-500/60 shadow-lg shadow-cyan-950/40 bg-slate-900/95"
                      : "border-slate-800/80 hover:border-slate-700"
                  }`}
                >
                  <div className="p-4 flex items-center justify-between gap-3">
                    {/* Imagem / Ícone Placeholder do Produto */}
                    <div className="w-14 h-14 rounded-2xl bg-slate-800/90 border border-slate-700/80 flex items-center justify-center shrink-0 overflow-hidden relative">
                      {prod.imageUrl ? (
                        <img
                          src={prod.imageUrl}
                          alt={prod.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            // fallback on image load error
                            (e.target as HTMLElement).style.display = "none";
                          }}
                        />
                      ) : null}
                      <div className="text-cyan-400">
                        {prod.category === "cafe" || prod.category === "cafe_capsulas" ? (
                          <Coffee className="w-6 h-6 text-amber-400" />
                        ) : prod.isCourtesy ? (
                          <Sparkles className="w-6 h-6 text-emerald-400" />
                        ) : (
                          <Refrigerator className="w-6 h-6 text-cyan-400" />
                        )}
                      </div>
                    </div>

                    {/* Detalhes do Produto */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h3 className="text-sm font-bold text-white truncate">{prod.name}</h3>
                        {prod.isCourtesy && (
                          <Badge variant="outline" className="bg-emerald-950/80 text-emerald-300 border-emerald-800 text-[10px] font-bold">
                            Cortesia 1x
                          </Badge>
                        )}
                      </div>

                      {/* Selo/Badge do Padrão Nominal Não-Editável */}
                      <div className="flex flex-wrap items-center gap-2 pt-0.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800/90 border border-slate-700 text-[10px] font-semibold text-slate-300 select-none">
                          <Package className="w-3 h-3 text-cyan-400 shrink-0" />
                          <span>Padrão no flat: <strong>{nominalStandard} un.</strong></span>
                        </span>

                        <span className="text-xs font-black text-cyan-400">
                          {isCourtesyFree ? "Gratuito (1x estadia)" : formatBRL(prod.price)}
                        </span>
                      </div>
                    </div>

                    {/* Controles de Quantidade (- / +) */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleUpdateQuantity(prod.id, -1)}
                        disabled={currentQty <= 0}
                        aria-label={`Diminuir quantidade de ${prod.name}`}
                        className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                          currentQty > 0
                            ? "bg-slate-800 hover:bg-slate-700 active:scale-95 text-white border border-slate-700"
                            : "bg-slate-900/40 text-slate-600 border border-slate-800/40 cursor-not-allowed opacity-50"
                        }`}
                      >
                        <Minus className="w-4 h-4" />
                      </button>

                      <span className={`w-7 text-center font-black text-sm ${currentQty > 0 ? "text-cyan-400" : "text-slate-500"}`}>
                        {currentQty}
                      </span>

                      <button
                        type="button"
                        onClick={() => handleUpdateQuantity(prod.id, 1)}
                        aria-label={`Aumentar quantidade de ${prod.name}`}
                        className="w-9 h-9 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:scale-95 text-slate-950 font-bold flex items-center justify-center shadow-md shadow-cyan-600/20 transition-all"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </main>

        {/* ── Barra Fixa Inferior (Subtotal Dinâmico e Avanço) ── */}
        <div className="fixed bottom-0 inset-x-0 bg-slate-900/95 backdrop-blur-xl border-t border-slate-800 p-4 z-40 shadow-2xl">
          <div className="max-w-xl mx-auto flex items-center justify-between gap-3">
            <div>
              <span className="text-[11px] text-slate-400 block font-medium">
                {totalQuantity === 0
                  ? "Nenhum item selecionado"
                  : `${totalQuantity} ${totalQuantity === 1 ? "item selecionado" : "itens selecionados"}`}
              </span>
              <div className="text-lg sm:text-xl font-black text-cyan-400">
                {formatBRL(totalAmount)}
              </div>
            </div>

            <Button
              onClick={() => setStep("checkout")}
              disabled={totalQuantity === 0}
              className={`h-12 px-6 rounded-2xl font-bold text-xs sm:text-sm shadow-xl flex items-center gap-2 transition-all ${
                totalQuantity > 0
                  ? "bg-cyan-600 hover:bg-cyan-500 text-slate-950 shadow-cyan-600/30 active:scale-[0.98]"
                  : "bg-slate-800 text-slate-500 cursor-not-allowed"
              }`}
            >
              <span>Avançar para Pagamento</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. TELA: CHECKOUT & DADOS FISCAIS
  // ─────────────────────────────────────────────────────────────────────────────
  if (step === "checkout") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 pb-28">
        <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-3 sm:px-6">
          <div className="max-w-xl mx-auto flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep("catalog")}
              className="text-xs text-slate-400 hover:text-white rounded-xl h-9 px-2"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              <span>Voltar ao Frigobar</span>
            </Button>
            <span className="text-xs font-bold text-slate-300">Resumo & Dados da NF</span>
          </div>
        </header>

        <main className="max-w-xl mx-auto p-4 sm:p-6 space-y-5">
          {/* Resumo do Pedido */}
          <Card className="bg-slate-900 border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Receipt className="w-4 h-4 text-cyan-400" />
              <span>Resumo do Consumo no Flat {reservation?.flatNumber}</span>
            </h2>

            <div className="divide-y divide-slate-800 text-xs">
              {selectedItemsList.map((item) => (
                <div key={item.product.id} className="py-2.5 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="font-bold text-slate-200">
                      {item.quantity}x {item.product.name}
                    </span>
                    <span className="text-[11px] text-slate-400 block">
                      {item.product.isCourtesy && !courtesyConsumed
                        ? "Cortesia de boas-vindas gratuita"
                        : `${formatBRL(item.product.price)} un.`}
                    </span>
                  </div>
                  <strong className="text-cyan-400 text-sm">
                    {formatBRL(item.subtotal)}
                  </strong>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-sm">
              <span className="font-bold text-slate-300">Total a Pagar</span>
              <span className="text-lg font-black text-cyan-400">{formatBRL(totalAmount)}</span>
            </div>
          </Card>

          {/* Opções de Emissão de Nota Fiscal (Mandatório F17) */}
          <Card className="bg-slate-900 border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="space-y-1">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-cyan-400" />
                <span>Preferência de Descrição na Nota Fiscal</span>
              </h2>
              <p className="text-xs text-slate-400">
                Selecione como os itens devem constar na Nota Fiscal emitida pela distribuidora conveniada (Anserve):
              </p>
            </div>

            <RadioGroup
              value={invoicePreference}
              onValueChange={(val) => setInvoicePreference(val as InvoicePreference)}
              className="space-y-2.5"
            >
              <label className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                invoicePreference === "detailed"
                  ? "bg-cyan-950/40 border-cyan-500/60 text-white"
                  : "bg-slate-800/40 border-slate-700/60 text-slate-300 hover:bg-slate-800/70"
              }`}>
                <RadioGroupItem value="detailed" id="opt-detailed" className="mt-0.5" />
                <div className="space-y-0.5">
                  <span className="text-xs font-bold block">1. Discriminar todos os itens consumidos</span>
                  <span className="text-[11px] text-slate-400 block">
                    Lista detalhada de cada refrigerante, água, cerveja ou snack consumido.
                  </span>
                </div>
              </label>

              <label className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                invoicePreference === "water"
                  ? "bg-cyan-950/40 border-cyan-500/60 text-white"
                  : "bg-slate-800/40 border-slate-700/60 text-slate-300 hover:bg-slate-800/70"
              }`}>
                <RadioGroupItem value="water" id="opt-water" className="mt-0.5" />
                <div className="space-y-0.5">
                  <span className="text-xs font-bold block">2. Lançar tudo como "Água"</span>
                  <span className="text-[11px] text-slate-400 block">
                    Recomendado para viajantes a trabalho cuja política corporativa veda bebidas alcoólicas ou doces em reembolso.
                  </span>
                </div>
              </label>

              <label className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                invoicePreference === "minibar_consumption"
                  ? "bg-cyan-950/40 border-cyan-500/60 text-white"
                  : "bg-slate-800/40 border-slate-700/60 text-slate-300 hover:bg-slate-800/70"
              }`}>
                <RadioGroupItem value="minibar_consumption" id="opt-minibar" className="mt-0.5" />
                <div className="space-y-0.5">
                  <span className="text-xs font-bold block">3. Lançar tudo como "Consumo de Frigobar"</span>
                  <span className="text-[11px] text-slate-400 block">
                    Descrição consolidada padrão de serviços de conveniência em hospedagem.
                  </span>
                </div>
              </label>
            </RadioGroup>
          </Card>

          {/* Dados Fiscais: Documento (CPF / CNPJ) e E-mail */}
          <Card className="bg-slate-900 border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-cyan-400" />
              <span>Dados para Envio da Nota Fiscal</span>
            </h2>

            <div className="space-y-3">
              {reservation?.document && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDocChoice("cadastrado")}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                      docChoice === "cadastrado"
                        ? "bg-cyan-950/60 border-cyan-500 text-cyan-300"
                        : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white"
                    }`}
                  >
                    Usar meu CPF ({formatDocMask(reservation.document)})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDocChoice("personalizado")}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                      docChoice === "personalizado"
                        ? "bg-cyan-950/60 border-cyan-500 text-cyan-300"
                        : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white"
                    }`}
                  >
                    Outro CPF ou CNPJ
                  </button>
                </div>
              )}

              {docChoice === "personalizado" || !reservation?.document ? (
                <div className="space-y-3 pt-1">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-300 font-semibold">CPF ou CNPJ da Empresa</Label>
                    <Input
                      placeholder="000.000.000-00 ou 00.000.000/0000-00"
                      value={customDocument}
                      onChange={(e) => setCustomDocument(formatDocMask(e.target.value))}
                      className="h-11 bg-slate-800 border-slate-700 text-white rounded-xl text-xs"
                    />
                  </div>

                  {customDocument.replace(/\D/g, "").length === 14 && (
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-300 font-semibold">Razão Social (Opcional)</Label>
                      <Input
                        placeholder="Nome da empresa no CNPJ"
                        value={customCompanyName}
                        onChange={(e) => setCustomCompanyName(e.target.value)}
                        className="h-11 bg-slate-800 border-slate-700 text-white rounded-xl text-xs"
                      />
                    </div>
                  )}
                </div>
              ) : null}

              <div className="space-y-1 pt-1">
                <Label className="text-xs text-slate-300 font-semibold flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-cyan-400" />
                  <span>E-mail para Recebimento da Nota Fiscal</span>
                </Label>
                <Input
                  type="email"
                  placeholder="seuemail@exemplo.com"
                  value={invoiceEmail}
                  onChange={(e) => setInvoiceEmail(e.target.value)}
                  className="h-11 bg-slate-800 border-slate-700 text-white rounded-xl text-xs"
                />
                <span className="text-[10px] text-slate-400 block">
                  A distribuidora Anserve emitirá e enviará o PDF da Nota Fiscal para este e-mail.
                </span>
              </div>
            </div>
          </Card>

          {/* Seleção do Meio de Pagamento */}
          {totalAmount > 0 && (
            <Card className="bg-slate-900 border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-cyan-400" />
                <span>Forma de Pagamento</span>
              </h2>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("pix")}
                  className={`p-3.5 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all ${
                    paymentMethod === "pix"
                      ? "bg-cyan-950/60 border-cyan-500 text-cyan-300 shadow-md shadow-cyan-950/50"
                      : "bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white"
                  }`}
                >
                  <QrCode className="w-5 h-5 text-cyan-400" />
                  <span className="text-xs font-bold">PIX (Banco Inter)</span>
                  <span className="text-[10px] text-emerald-400 font-medium">Confirmação Imediata</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod("credit_card")}
                  className={`p-3.5 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all ${
                    paymentMethod === "credit_card"
                      ? "bg-cyan-950/60 border-cyan-500 text-cyan-300 shadow-md shadow-cyan-950/50"
                      : "bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white"
                  }`}
                >
                  <CreditCard className="w-5 h-5 text-indigo-400" />
                  <span className="text-xs font-bold">Cartão de Crédito</span>
                  <span className="text-[10px] text-slate-400 font-medium">Mercado Pago</span>
                </button>
              </div>
            </Card>
          )}

          {orderError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{orderError}</span>
            </div>
          )}

          {/* Botão de Finalização */}
          <Button
            onClick={handleCheckoutSubmit}
            disabled={isSubmittingOrder}
            className="w-full h-14 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-2xl text-sm shadow-xl shadow-cyan-600/20 flex items-center justify-center gap-2 active:scale-[0.99] transition-all"
          >
            {isSubmittingOrder ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>Processando Pedido...</span>
              </>
            ) : totalAmount === 0 ? (
              <>
                <Sparkles className="w-5 h-5 text-slate-950" />
                <span>Resgatar Cortesia de Boas-Vindas Gratuita</span>
              </>
            ) : paymentMethod === "pix" ? (
              <>
                <QrCode className="w-5 h-5" />
                <span>Gerar QR Code PIX ({formatBRL(totalAmount)})</span>
              </>
            ) : (
              <>
                <CreditCard className="w-5 h-5" />
                <span>Pagar com Cartão ({formatBRL(totalAmount)})</span>
              </>
            )}
          </Button>
        </main>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. TELA: MODAL & FLUXO DE PAGAMENTO (PIX & CARTÃO)
  // ─────────────────────────────────────────────────────────────────────────────
  if (step === "payment") {
    const pixCode = activeOrder?.pixCopiaECola || activeOrder?.pixQrCode || "";
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(pixCode)}`;

    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 pb-12">
        <Card className="w-full max-w-md bg-slate-900 border-slate-800 shadow-2xl rounded-3xl p-6 sm:p-7 space-y-5 text-center">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-950/80 border border-cyan-800/80 text-cyan-400 text-xs font-bold">
              <Clock className="w-3.5 h-3.5" />
              <span>Aguardando Pagamento</span>
            </div>
            <h1 className="text-xl font-black text-white pt-1">
              Total: {formatBRL(activeOrder?.totalAmount || totalAmount)}
            </h1>
            <p className="text-xs text-slate-400">
              Consumo Frigobar — Flat {reservation?.flatNumber}
            </p>
          </div>

          {paymentMethod === "pix" ? (
            <div className="space-y-4">
              {/* QR Code Imagem */}
              <div className="p-4 bg-white rounded-2xl w-56 h-56 mx-auto shadow-inner flex items-center justify-center">
                <img
                  src={qrImageUrl}
                  alt="QR Code PIX Banco Inter"
                  className="w-full h-full object-contain"
                />
              </div>

              {/* Botão Copia e Cola */}
              <div className="space-y-2">
                <Button
                  onClick={handleCopyPix}
                  className="w-full h-12 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-cyan-600/20"
                >
                  {copiedPix ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-950" />
                      <span>Código PIX Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copiar Código PIX (Copia e Cola)</span>
                    </>
                  )}
                </Button>

                <p className="text-[11px] text-slate-400">
                  Abra o aplicativo do seu banco e escolha a opção <strong>PIX Copia e Cola</strong>.
                </p>
              </div>

              {/* Indicador de Polling Ativo */}
              <div className="p-3 bg-slate-800/80 border border-slate-700/60 rounded-xl flex items-center justify-center gap-2 text-xs text-cyan-300">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                <span>Aguardando confirmação bancária em tempo real...</span>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-6 bg-slate-800/60 rounded-2xl border border-slate-700 text-center space-y-3">
                <CreditCard className="w-10 h-10 text-indigo-400 mx-auto" />
                <p className="text-xs text-slate-300">
                  Você está sendo redirecionado para o ambiente seguro do Mercado Pago.
                </p>
                {activeOrder?.initPoint && (
                  <Button
                    onClick={() => window.open(activeOrder.initPoint, "_blank")}
                    className="w-full h-11 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2"
                  >
                    <span>Abrir Checkout Mercado Pago</span>
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                )}
              </div>

              <div className="p-3 bg-slate-800/80 border border-slate-700/60 rounded-xl flex items-center justify-center gap-2 text-xs text-indigo-300">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                <span>Aguardando aprovação do cartão...</span>
              </div>
            </div>
          )}

          <div className="pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (pollingRef.current) {
                  clearInterval(pollingRef.current);
                  pollingRef.current = null;
                }
                setStep("checkout");
              }}
              className="text-xs text-slate-400 hover:text-white"
            >
              Cancelar e Voltar ao Checkout
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. TELA: CONFIRMAÇÃO & SUCESSO
  // ─────────────────────────────────────────────────────────────────────────────
  if (step === "success") {
    const isFree = (activeOrder?.totalAmount || totalAmount) === 0;

    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6">
        <Card className="w-full max-w-md bg-slate-900 border-slate-800 shadow-2xl rounded-3xl p-6 sm:p-8 space-y-6 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div className="space-y-1.5">
            <h1 className="text-xl sm:text-2xl font-black text-white">
              {isFree ? "Cortesia Resgatada! ✨" : "Pagamento Confirmado! 🎉"}
            </h1>
            <p className="text-xs text-slate-300">
              {isFree
                ? `Sua cortesia de boas-vindas do Flat ${reservation?.flatNumber} foi registrada com sucesso.`
                : `Recebemos a confirmação do seu consumo no Flat ${reservation?.flatNumber}.`}
            </p>
          </div>

          <div className="p-4 bg-slate-800/60 rounded-2xl border border-slate-700/80 text-left text-xs space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span>Pedido:</span>
              <strong className="text-slate-200">{activeOrder?.orderId || "ORD-MB-SUCESSO"}</strong>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>Valor Total:</span>
              <strong className="text-emerald-400">{formatBRL(activeOrder?.totalAmount || totalAmount)}</strong>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>Nota Fiscal:</span>
              <strong className="text-slate-200">
                {invoicePreference === "water"
                  ? "Lançado como 'Água'"
                  : invoicePreference === "minibar_consumption"
                  ? "Consumo de Frigobar"
                  : "Itens Discriminados"}
              </strong>
            </div>
            {invoiceEmail && (
              <div className="flex items-center justify-between text-slate-400">
                <span>E-mail da NF:</span>
                <strong className="text-slate-200 truncate max-w-[180px]">{invoiceEmail}</strong>
              </div>
            )}
          </div>

          <div className="text-xs text-slate-400 leading-relaxed space-y-1">
            <p>
              A distribuidora Anserve emitirá sua Nota Fiscal e disponibilizará o documento na sua área de reserva, além de enviar uma cópia por e-mail e WhatsApp.
            </p>
          </div>

          <div className="space-y-2 pt-2">
            {reservation?.reservationCode ? (
              <Button
                onClick={() => setLocation(`/minha-reserva/${reservation.reservationCode}`)}
                className="w-full h-12 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-2xl text-xs sm:text-sm"
              >
                <span>Voltar à Minha Reserva</span>
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button
                onClick={() => setLocation("/")}
                className="w-full h-12 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-2xl text-xs sm:text-sm"
              >
                <span>Concluir</span>
              </Button>
            )}
          </div>
        </Card>
      </div>
    );
  }

  return null;
}
