import React, { useState, useEffect, useMemo } from "react";
import { Shell } from "@/components/layout";
import { MinibarEcosystemNav } from "@/components/minibar-ecosystem-nav";
import { useGetMe } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import {
  FileText,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RefreshCw,
  Search,
  Calendar,
  DollarSign,
  Download,
  Building2,
  Package,
  FileCheck,
  Send,
  MessageSquare,
  Mail,
  User,
  Users,
  ExternalLink,
  Copy,
  Check,
  Filter,
  Sparkles,
  Phone,
  CreditCard,
  QrCode,
  Layers
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";

export interface SiblingOrderSummary {
  id: string;
  sequence: number;
  guestName: string;
  guestIndex: number;
  guestRole: string;
  guestDocument: string;
  totalAmount: number;
  paidAt: string;
  partialMode: string;
  invoiceStatus: string;
  invoiceNumber?: string | null;
  invoiceFileUrl?: string | null;
}

export interface EnrichedInvoiceOrder {
  id: string;
  flatNumber: string;
  reservationCode: string;
  guestName: string;
  guestPhone?: string;
  guestEmail?: string;
  guestDocument?: string;
  guestIndex?: number;
  guestRole?: string;
  totalAmount: number;
  paymentMethod: string;
  paymentStatus: string;
  paidAt?: string;
  createdAt: string;
  consumptionDatesBr: string[];
  dailyLaunches: Array<{
    date: string;
    dateBr: string;
    totalDayAmount: number;
    items: Array<{
      itemKey: string;
      productId: string;
      productName: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
      launchDateBr: string;
      isCourtesy?: boolean;
    }>;
  }>;
  reservationTotalLaunchedAmount: number;
  reservationTotalPaidAmount: number;
  reservationPendingBalance: number;
  isCheckedOut: boolean;
  checkoutTime?: string | null;
  checkInDateBr?: string;
  checkOutDateBr?: string;
  numGuestsInFlat: number;
  items: Array<{
    productId: string;
    productName?: string;
    name?: string;
    quantity: number;
    unitPrice?: number;
    totalPrice?: number;
    launchDateBr?: string;
    isCourtesy?: boolean;
  }>;
  splitPaymentInfo: {
    isSeparatePayment: boolean;
    partialMode: string;
    partialModeLabel: string;
    orderSequenceIndex: number;
    totalPaidOrdersInReservation: number;
    guestIndex: number;
    guestRole: string;
    siblingOrders: SiblingOrderSummary[];
  };
  fiscalSummary: {
    payerName: string;
    documentType: "CPF" | "CNPJ";
    documentNumber: string;
    email: string;
    phone: string;
    invoiceDescriptionType: "detailed" | "water" | "minibar_consumption" | string;
    invoiceDescriptionLabel: string;
    readyToPasteDescription: string;
  };
  invoice?: {
    status: string;
    invoiceFileUrl?: string;
    invoiceFileName?: string;
    invoiceNumber?: string;
    attachedAt?: string;
    attachedBy?: string;
    whatsappSentAt?: string;
    emailSentAt?: string;
    deliveryMonitor?: {
      overallStatus: "entregue" | "parcial" | "retentando" | "falha" | "processando";
      whatsapp?: {
        status: string;
        target?: string;
        attempts?: number;
        lastError?: string | null;
      };
      email?: {
        status: string;
        target?: string;
        attempts?: number;
        lastError?: string | null;
      };
    };
  };
}

function formatDocBr(raw: string): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
  }
  if (digits.length === 14) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
  }
  return raw || "Não informado";
}

function formatDateTimeBr(iso?: string): string {
  if (!iso) return "—";
  try {
    const dt = new Date(iso);
    if (isNaN(dt.getTime())) return iso;
    return dt.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return iso;
  }
}

export default function MinibarInvoicesPage() {
  const { data: currentUser } = useGetMe();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [pendingInvoices, setPendingInvoices] = useState<EnrichedInvoiceOrder[]>([]);
  const [issuedInvoices, setIssuedInvoices] = useState<EnrichedInvoiceOrder[]>([]);
  const [failedDeliveries, setFailedDeliveries] = useState<EnrichedInvoiceOrder[]>([]);
  const [stats, setStats] = useState({
    pendingCount: 0,
    pendingTotalAmount: 0,
    separatePaymentsPendingCount: 0,
    issuedCount: 0,
    issuedTotalAmount: 0,
    failedDeliveriesCount: 0
  });

  // Filtros
  const [activeTab, setActiveTab] = useState<"pending" | "issued" | "failed">("pending");
  const [flatFilter, setFlatFilter] = useState<string>("todos");
  const [splitFilter, setSplitFilter] = useState<"todos" | "separate" | "single">("todos");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Copiar para área de transferência
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Modal de Anexar Nota Fiscal
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<EnrichedInvoiceOrder | null>(null);
  const [invoiceNumberInput, setInvoiceNumberInput] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("");
  const [selectedFileBase64, setSelectedFileBase64] = useState("");
  const [uploadingInvoice, setUploadingInvoice] = useState(false);

  // Modal de Reenvio / Correção de Contato
  const [retryModalOpen, setRetryModalOpen] = useState(false);
  const [retryOrder, setRetryOrder] = useState<EnrichedInvoiceOrder | null>(null);
  const [retryPhone, setRetryPhone] = useState("");
  const [retryEmail, setRetryEmail] = useState("");
  const [retryingSend, setRetryingSend] = useState(false);

  const fetchHubData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/minibar/invoices/hub", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setPendingInvoices(Array.isArray(data.pendingInvoices) ? data.pendingInvoices : []);
        setIssuedInvoices(Array.isArray(data.issuedInvoices) ? data.issuedInvoices : []);
        setFailedDeliveries(Array.isArray(data.failedDeliveries) ? data.failedDeliveries : []);
        if (data.stats) setStats(data.stats);
      }
    } catch (err) {
      console.error("Erro ao carregar central de notas fiscais:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHubData();
  }, []);

  const handleCopy = (text: string, key: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast({
      title: `${label} copiado!`,
      description: text.length > 70 ? text.slice(0, 70) + "..." : text
    });
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const allAvailableFlats = useMemo(() => {
    const s = new Set<string>();
    for (const o of [...pendingInvoices, ...issuedInvoices]) {
      if (o.flatNumber) s.add(String(o.flatNumber));
    }
    return Array.from(s).sort((a, b) => Number(a) - Number(b));
  }, [pendingInvoices, issuedInvoices]);

  const currentList = useMemo(() => {
    const source =
      activeTab === "pending"
        ? pendingInvoices
        : activeTab === "issued"
        ? issuedInvoices
        : failedDeliveries;

    return source.filter(ord => {
      if (flatFilter !== "todos" && String(ord.flatNumber) !== flatFilter) return false;
      if (splitFilter === "separate" && !ord.splitPaymentInfo?.isSeparatePayment) return false;
      if (splitFilter === "single" && ord.splitPaymentInfo?.isSeparatePayment) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchFlat = String(ord.flatNumber || "").toLowerCase().includes(q);
        const matchRes = String(ord.reservationCode || "").toLowerCase().includes(q);
        const matchGuest = String(ord.fiscalSummary?.payerName || ord.guestName || "").toLowerCase().includes(q);
        const matchDoc = String(ord.fiscalSummary?.documentNumber || ord.guestDocument || "").toLowerCase().includes(q);
        const matchId = String(ord.id || "").toLowerCase().includes(q);
        const matchNf = String(ord.invoice?.invoiceNumber || "").toLowerCase().includes(q);
        if (!matchFlat && !matchRes && !matchGuest && !matchDoc && !matchId && !matchNf) return false;
      }
      return true;
    });
  }, [activeTab, pendingInvoices, issuedInvoices, failedDeliveries, flatFilter, splitFilter, searchQuery]);

  const openUploadModal = (order: EnrichedInvoiceOrder) => {
    setSelectedOrder(order);
    setInvoiceNumberInput(order.invoice?.invoiceNumber || "");
    setSelectedFileName("");
    setSelectedFileBase64("");
    setUploadModalOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setSelectedFileBase64(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAttachInvoice = async () => {
    if (!selectedOrder) return;
    if (!selectedFileBase64) {
      toast({
        title: "Selecione o arquivo da Nota Fiscal",
        description: "Escolha o PDF ou imagem da Nota Fiscal emitida para enviar ao hóspede.",
        variant: "destructive"
      });
      return;
    }

    setUploadingInvoice(true);
    try {
      const res = await fetch(`/api/minibar/orders/${selectedOrder.id}/invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fileData: selectedFileBase64,
          fileName: selectedFileName || `NF_Flat_${selectedOrder.flatNumber}_${selectedOrder.id}.pdf`,
          invoiceNumber: invoiceNumberInput.trim() || undefined
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erro ao anexar Nota Fiscal.");
      }

      toast({
        title: "✅ Nota Fiscal Anexada e Enviada!",
        description: `Enviada automaticamente para ${selectedOrder.fiscalSummary?.payerName} via WhatsApp e E-mail.`
      });
      setUploadModalOpen(false);
      await fetchHubData();
    } catch (err: any) {
      toast({
        title: "Erro ao anexar Nota Fiscal",
        description: err.message || "Tente novamente.",
        variant: "destructive"
      });
    } finally {
      setUploadingInvoice(false);
    }
  };

  const openRetryModal = (order: EnrichedInvoiceOrder) => {
    setRetryOrder(order);
    setRetryPhone(order.fiscalSummary?.phone || order.guestPhone || "");
    setRetryEmail(order.fiscalSummary?.email || order.guestEmail || "");
    setRetryModalOpen(true);
  };

  const handleRetryDelivery = async () => {
    if (!retryOrder) return;
    setRetryingSend(true);
    try {
      const res = await fetch(`/api/minibar/orders/${retryOrder.id}/invoice/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          phone: retryPhone.trim(),
          email: retryEmail.trim(),
          channels: ["whatsapp", "email"]
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Falha ao reenviar Nota Fiscal.");
      }
      toast({
        title: "🔄 Reenvio Disparado!",
        description: "A Nota Fiscal foi reenviada para o WhatsApp e E-mail atualizados."
      });
      setRetryModalOpen(false);
      await fetchHubData();
    } catch (err: any) {
      toast({
        title: "Erro ao reenviar",
        description: err.message,
        variant: "destructive"
      });
    } finally {
      setRetryingSend(false);
    }
  };

  return (
    <Shell>
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-5">
        <MinibarEcosystemNav currentScreen="notas" pendingInvoicesCount={stats.pendingCount} />

        {/* Cabeçalho */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 sm:p-6 rounded-2xl shadow-lg border border-indigo-500/20">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-indigo-500/20 text-indigo-200 border border-indigo-400/30 font-semibold">
                <FileText className="w-3.5 h-3.5 mr-1.5" />
                Central Exclusiva de Faturamento — Frigobar
              </Badge>
              <Badge variant="outline" className="text-emerald-300 border-emerald-500/40 bg-emerald-500/10">
                Disparo Automático WhatsApp + E-mail
              </Badge>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
              Emissão e Envio de Notas Fiscais (Frigobar)
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-3xl">
              Consulte todos os flats pendentes de emissão, dias de lançamento do consumo, divisão de pagamento entre hóspedes, dados fiscais prontos para copiar e anexe o PDF/foto da Nota Fiscal.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchHubData}
              disabled={loading}
              className="bg-white/10 text-white border-white/20 hover:bg-white/20"
            >
              <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              Atualizar Fila
            </Button>
          </div>
        </div>

        {/* KPIs Superiores */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card
            onClick={() => setActiveTab("pending")}
            className={`cursor-pointer transition-all border-l-4 ${
              activeTab === "pending"
                ? "border-l-amber-500 ring-2 ring-amber-500/20 bg-amber-50/40 dark:bg-amber-950/20"
                : "border-l-amber-500 hover:bg-slate-50/80"
            }`}
          >
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  Pendentes de Emissão
                </p>
                <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
                  {stats.pendingCount} {stats.pendingCount === 1 ? "nota" : "notas"}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Total pago aguardando NF:{" "}
                  <strong className="text-slate-700 dark:text-slate-200">
                    R$ {Number(stats.pendingTotalAmount || 0).toFixed(2).replace(".", ",")}
                  </strong>
                </p>
              </div>
              <div className="w-11 h-11 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-amber-600">
                <Clock className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>

          <Card
            onClick={() => {
              setActiveTab("pending");
              setSplitFilter(splitFilter === "separate" ? "todos" : "separate");
            }}
            className={`cursor-pointer transition-all border-l-4 ${
              splitFilter === "separate"
                ? "border-l-purple-600 ring-2 ring-purple-500/20 bg-purple-50/40 dark:bg-purple-950/20"
                : "border-l-purple-500 hover:bg-slate-50/80"
            }`}
          >
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-purple-700 dark:text-purple-400">
                  Pagamentos Separados
                </p>
                <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
                  {stats.separatePaymentsPendingCount}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {splitFilter === "separate" ? "Filtro ativo (clique p/ ver todos)" : "Divididos por hóspede no flat"}
                </p>
              </div>
              <div className="w-11 h-11 rounded-xl bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center text-purple-600">
                <Users className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>

          <Card
            onClick={() => setActiveTab("issued")}
            className={`cursor-pointer transition-all border-l-4 ${
              activeTab === "issued"
                ? "border-l-emerald-600 ring-2 ring-emerald-500/20 bg-emerald-50/40 dark:bg-emerald-950/20"
                : "border-l-emerald-500 hover:bg-slate-50/80"
            }`}
          >
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  Notas Emitidas & Anexadas
                </p>
                <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
                  {stats.issuedCount}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Total faturado:{" "}
                  <strong className="text-slate-700 dark:text-slate-200">
                    R$ {Number(stats.issuedTotalAmount || 0).toFixed(2).replace(".", ",")}
                  </strong>
                </p>
              </div>
              <div className="w-11 h-11 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-emerald-600">
                <FileCheck className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>

          <Card
            onClick={() => setActiveTab("failed")}
            className={`cursor-pointer transition-all border-l-4 ${
              activeTab === "failed"
                ? "border-l-rose-600 ring-2 ring-rose-500/20 bg-rose-50/40 dark:bg-rose-950/20"
                : "border-l-rose-500 hover:bg-slate-50/80"
            }`}
          >
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-400">
                  Monitor de Envios (Falhas)
                </p>
                <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
                  {stats.failedDeliveriesCount}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {stats.failedDeliveriesCount === 0
                    ? "100% entregues sem erro"
                    : "Clique para corrigir e reenviar"}
                </p>
              </div>
              <div className="w-11 h-11 rounded-xl bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center text-rose-600">
                <AlertTriangle className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Barra de Abas e Filtros */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              {/* Abas */}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant={activeTab === "pending" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveTab("pending")}
                  className={activeTab === "pending" ? "bg-amber-600 hover:bg-amber-700 text-white" : ""}
                >
                  <Clock className="w-4 h-4 mr-1.5" />
                  Pendentes de Emissão ({pendingInvoices.length})
                </Button>
                <Button
                  variant={activeTab === "issued" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveTab("issued")}
                  className={activeTab === "issued" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}
                >
                  <CheckCircle2 className="w-4 h-4 mr-1.5" />
                  Já Emitidas / Anexadas ({issuedInvoices.length})
                </Button>
                {failedDeliveries.length > 0 && (
                  <Button
                    variant={activeTab === "failed" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveTab("failed")}
                    className={activeTab === "failed" ? "bg-rose-600 hover:bg-rose-700 text-white" : "border-rose-300 text-rose-700"}
                  >
                    <AlertTriangle className="w-4 h-4 mr-1.5" />
                    Falhas de Entrega ({failedDeliveries.length})
                  </Button>
                )}
              </div>

              {/* Filtros Rápidos */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <div className="relative min-w-[220px]">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Buscar flat, hóspede, CPF/CNPJ..."
                    className="pl-9 h-9 text-xs sm:text-sm"
                  />
                </div>

                <select
                  value={flatFilter}
                  onChange={e => setFlatFilter(e.target.value)}
                  className="h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs sm:text-sm font-medium"
                >
                  <option value="todos">Todos os Flats</option>
                  {allAvailableFlats.map(f => (
                    <option key={f} value={f}>
                      Flat {f}
                    </option>
                  ))}
                </select>

                <select
                  value={splitFilter}
                  onChange={e => setSplitFilter(e.target.value as any)}
                  className="h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs sm:text-sm font-medium"
                >
                  <option value="todos">Todos os Tipos de Pagamento</option>
                  <option value="separate">👥 Apenas Pagamentos Separados / Parciais</option>
                  <option value="single">✅ Apenas Pagamento Único Integral</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Lista de Notas Fiscais */}
        {loading ? (
          <Card className="p-12 text-center">
            <div className="flex flex-col items-center gap-3">
              <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
              <p className="text-sm font-semibold text-slate-600">Carregando informações fiscais de cada flat...</p>
            </div>
          </Card>
        ) : currentList.length === 0 ? (
          <Card className="p-12 text-center border-dashed">
            <div className="flex flex-col items-center gap-3 max-w-md mx-auto">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                {activeTab === "pending"
                  ? "Nenhuma Nota Fiscal pendente de emissão!"
                  : activeTab === "issued"
                  ? "Nenhuma Nota Fiscal anexada para este filtro."
                  : "Nenhuma falha de envio pendente!"}
              </h3>
              <p className="text-xs text-slate-500">
                Assim que um hóspede realizar o pagamento do frigobar (integral ou separado), os dados completos para emissão da Nota Fiscal aparecerão automaticamente aqui.
              </p>
            </div>
          </Card>
        ) : (
          <div className="space-y-5">
            {currentList.map(order => {
              const split = order.splitPaymentInfo;
              const fiscal = order.fiscalSummary;
              const isIssued = order.invoice?.status === "anexada";
              const monitor = order.invoice?.deliveryMonitor;

              return (
                <Card
                  key={order.id}
                  className={`overflow-hidden border-2 transition-all shadow-sm ${
                    isIssued
                      ? "border-emerald-200 dark:border-emerald-900/50"
                      : split?.isSeparatePayment
                      ? "border-purple-300 dark:border-purple-800/70"
                      : "border-amber-300 dark:border-amber-800/70"
                  }`}
                >
                  {/* Faixa de Topo do Card: Flat, Reserva, Datas de Consumo, Status de Divisão e Valor */}
                  <div
                    className={`px-4 sm:px-6 py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b ${
                      isIssued
                        ? "bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200/70"
                        : split?.isSeparatePayment
                        ? "bg-purple-50/70 dark:bg-purple-950/30 border-purple-200/70"
                        : "bg-amber-50/70 dark:bg-amber-950/30 border-amber-200/70"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2.5">
                      <Badge className="bg-slate-900 text-white text-sm px-3 py-1 font-bold">
                        <Building2 className="w-3.5 h-3.5 mr-1.5" />
                        Flat {order.flatNumber}
                      </Badge>

                      {order.reservationCode && (
                        <Badge variant="outline" className="font-mono text-xs bg-white dark:bg-slate-900 font-semibold">
                          Reserva: {order.reservationCode}
                        </Badge>
                      )}

                      {/* Datas dos Lançamentos de Consumo (DD/MM/AAAA) */}
                      <Badge
                        variant="outline"
                        className="bg-white dark:bg-slate-900 border-indigo-200 text-indigo-800 dark:text-indigo-300 text-xs font-semibold"
                      >
                        <Calendar className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
                        {order.consumptionDatesBr?.length > 1
                          ? `Dias de consumo: ${order.consumptionDatesBr.join(", ")}`
                          : `Dia do consumo: ${order.consumptionDatesBr?.[0] || "—"}`}
                      </Badge>

                      {/* Badge se o pagamento foi separado ou único */}
                      {split?.isSeparatePayment ? (
                        <Badge className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold px-2.5 py-0.5">
                          <Users className="w-3.5 h-3.5 mr-1.5" />
                          Pagamento Separado ({split.orderSequenceIndex}ª de {split.totalPaidOrdersInReservation} NFs do Flat) • {split.partialModeLabel}
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-2.5 py-0.5">
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                          Pagamento Único Integral
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                        {order.paymentMethod === "pix" ? (
                          <Badge variant="outline" className="bg-teal-50 text-teal-800 border-teal-300 text-xs">
                            <QrCode className="w-3 h-3 mr-1" /> PIX Pago
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-blue-50 text-blue-800 border-blue-300 text-xs">
                            <CreditCard className="w-3 h-3 mr-1" /> Cartão Pago
                          </Badge>
                        )}
                        <span>em {formatDateTimeBr(order.paidAt || order.createdAt)}</span>
                      </div>

                      <div className="bg-white dark:bg-slate-900 px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
                        <span className="text-[11px] uppercase font-bold text-slate-400 mr-1.5">Valor desta Nota:</span>
                        <span className="text-base sm:text-lg font-extrabold text-emerald-700 dark:text-emerald-400">
                          R$ {Number(order.totalAmount || 0).toFixed(2).replace(".", ",")}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Corpo Principal em Grid (3 Colunas no Desktop, Empilhado no Celular) */}
                  <CardContent className="p-4 sm:p-6">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                      {/* COLUNA 1 (4 cols): Consumo Detalhado por Dia + Divisão de Pagamento do Flat */}
                      <div className="lg:col-span-4 space-y-4">
                        <div className="bg-slate-50 dark:bg-slate-900/60 rounded-xl p-3.5 border border-slate-200 dark:border-slate-800 space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                              <Package className="w-4 h-4 text-indigo-600" />
                              Itens Pagos nesta Nota
                            </h4>
                            <span className="text-[11px] font-medium text-slate-500">
                              Pedido #{order.id.slice(-8)}
                            </span>
                          </div>

                          <div className="divide-y divide-slate-200/70 dark:divide-slate-800 text-xs">
                            {(order.items || []).map((it, idx) => (
                              <div key={idx} className="py-2 flex items-center justify-between gap-2">
                                <div>
                                  <span className="font-bold text-slate-800 dark:text-slate-100">
                                    {it.quantity}x {it.productName || it.name}
                                  </span>
                                  {it.launchDateBr && (
                                    <span className="ml-1.5 text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
                                      ({it.launchDateBr})
                                    </span>
                                  )}
                                  {it.isCourtesy && (
                                    <Badge className="ml-1.5 bg-emerald-100 text-emerald-800 text-[10px] px-1.5 py-0">
                                      Cortesia
                                    </Badge>
                                  )}
                                </div>
                                <span className="font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                                  R$ {Number(it.totalPrice ?? (it.quantity * (it.unitPrice || 0))).toFixed(2).replace(".", ",")}
                                </span>
                              </div>
                            ))}
                          </div>

                          {/* Histórico de Lançamentos por Dia da Reserva (se houver mais de 1 dia ou lançamento das repositoras) */}
                          {order.dailyLaunches && order.dailyLaunches.length > 0 && (
                            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
                              <p className="text-[11px] font-bold uppercase text-slate-500">
                                📅 Resumo de Lançamentos no Flat por Dia:
                              </p>
                              {order.dailyLaunches.map(dl => (
                                <div
                                  key={dl.date}
                                  className="text-[11px] bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-200/80 dark:border-slate-800 flex items-center justify-between"
                                >
                                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                                    {dl.dateBr}:{" "}
                                    <span className="font-normal text-slate-500">
                                      {(dl.items || []).map(i => `${i.quantity}x ${i.productName}`).join(", ")}
                                    </span>
                                  </span>
                                  <span className="font-bold text-slate-800 dark:text-slate-200 ml-2 whitespace-nowrap">
                                    R$ {Number(dl.totalDayAmount || 0).toFixed(2).replace(".", ",")}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Painel de Pagamento Separado / Outras Notas do mesmo Flat */}
                        {split?.isSeparatePayment && (
                          <div className="bg-purple-50/80 dark:bg-purple-950/30 rounded-xl p-3.5 border border-purple-200 dark:border-purple-800/70 space-y-2.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-purple-900 dark:text-purple-200 flex items-center gap-1.5">
                                <Layers className="w-4 h-4 text-purple-600" />
                                Divisão de Conta no Flat {order.flatNumber}
                              </span>
                              <Badge variant="outline" className="text-[11px] border-purple-300 text-purple-800 bg-white">
                                {split.guestIndex}º Hóspede ({split.guestRole})
                              </Badge>
                            </div>
                            <p className="text-xs text-purple-800 dark:text-purple-300">
                              Consumo Total do Flat:{" "}
                              <strong>R$ {Number(order.reservationTotalLaunchedAmount || 0).toFixed(2).replace(".", ",")}</strong>
                              {" • "}Total Pago:{" "}
                              <strong>R$ {Number(order.reservationTotalPaidAmount || 0).toFixed(2).replace(".", ",")}</strong>
                              {order.reservationPendingBalance > 0 && (
                                <span className="text-amber-700 font-semibold">
                                  {" • "}Falta pagar: R$ {Number(order.reservationPendingBalance).toFixed(2).replace(".", ",")}
                                </span>
                              )}
                            </p>

                            {split.siblingOrders && split.siblingOrders.length > 1 && (
                              <div className="space-y-1.5 pt-1">
                                <p className="text-[11px] font-bold uppercase text-purple-700 dark:text-purple-300">
                                  Pagamentos / Notas desta Reserva ({split.siblingOrders.length}):
                                </p>
                                {split.siblingOrders.map(sib => (
                                  <div
                                    key={sib.id}
                                    className={`text-xs px-2.5 py-1.5 rounded-lg border flex items-center justify-between ${
                                      sib.id === order.id
                                        ? "bg-purple-600 text-white border-purple-700 font-semibold"
                                        : "bg-white dark:bg-slate-900 text-slate-700 border-purple-200"
                                    }`}
                                  >
                                    <span className="truncate">
                                      {sib.sequence}ª NF: {sib.guestName} ({sib.guestIndex}º Hósp.)
                                    </span>
                                    <div className="flex items-center gap-2 whitespace-nowrap ml-2">
                                      <span>R$ {Number(sib.totalAmount || 0).toFixed(2).replace(".", ",")}</span>
                                      <Badge
                                        variant="outline"
                                        className={`text-[10px] px-1.5 py-0 ${
                                          sib.invoiceStatus === "anexada"
                                            ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                                            : "bg-amber-100 text-amber-800 border-amber-300"
                                        }`}
                                      >
                                        {sib.invoiceStatus === "anexada" ? "NF Emitida" : "Pendente"}
                                      </Badge>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* COLUNA 2 (5 cols): Dados Fiscais para Emissão da Nota Fiscal (Com 1-Click Copy) */}
                      <div className="lg:col-span-5 space-y-3">
                        <div className="bg-indigo-50/50 dark:bg-indigo-950/20 rounded-xl p-4 border border-indigo-200/80 dark:border-indigo-900/50 space-y-3.5">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-900 dark:text-indigo-300 flex items-center gap-1.5">
                              <FileText className="w-4 h-4 text-indigo-600" />
                              Dados para Emissão desta Nota Fiscal
                            </h4>
                            <Badge className="bg-indigo-600 text-white text-[11px]">
                              {fiscal?.documentType || "CPF"}
                            </Badge>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {/* Nome / Razão Social */}
                            <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-[10px] uppercase font-bold text-slate-400">Nome / Tomador</p>
                                <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                                  {fiscal?.payerName || order.guestName}
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 shrink-0"
                                onClick={() =>
                                  handleCopy(
                                    fiscal?.payerName || order.guestName,
                                    `name-${order.id}`,
                                    "Nome do tomador"
                                  )
                                }
                              >
                                {copiedKey === `name-${order.id}` ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                                )}
                              </Button>
                            </div>

                            {/* CPF ou CNPJ */}
                            <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-[10px] uppercase font-bold text-slate-400">
                                  {fiscal?.documentType || "CPF / CNPJ"}
                                </p>
                                <p className="text-xs sm:text-sm font-mono font-bold text-slate-900 dark:text-white truncate">
                                  {formatDocBr(fiscal?.documentNumber || order.guestDocument || "")}
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 shrink-0"
                                onClick={() =>
                                  handleCopy(
                                    fiscal?.documentNumber || order.guestDocument || "",
                                    `doc-${order.id}`,
                                    "CPF/CNPJ"
                                  )
                                }
                              >
                                {copiedKey === `doc-${order.id}` ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                                )}
                              </Button>
                            </div>

                            {/* WhatsApp */}
                            <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-[10px] uppercase font-bold text-slate-400">WhatsApp p/ Envio</p>
                                <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                                  {fiscal?.phone || order.guestPhone || "Não informado"}
                                </p>
                              </div>
                              {fiscal?.phone && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 shrink-0"
                                  onClick={() => handleCopy(fiscal.phone, `ph-${order.id}`, "WhatsApp")}
                                >
                                  {copiedKey === `ph-${order.id}` ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5 text-slate-500" />
                                  )}
                                </Button>
                              )}
                            </div>

                            {/* E-mail */}
                            <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-[10px] uppercase font-bold text-slate-400">E-mail p/ Envio</p>
                                <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                                  {fiscal?.email || order.guestEmail || "Não informado"}
                                </p>
                              </div>
                              {fiscal?.email && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 shrink-0"
                                  onClick={() => handleCopy(fiscal.email, `em-${order.id}`, "E-mail")}
                                >
                                  {copiedKey === `em-${order.id}` ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5 text-slate-500" />
                                  )}
                                </Button>
                              )}
                            </div>
                          </div>

                          {/* Opção de Discriminação Escolhida pelo Hóspede + Texto Pronto para Colar */}
                          <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-indigo-200 dark:border-indigo-800 space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-[11px] font-bold uppercase text-indigo-700 dark:text-indigo-300">
                                Preferência na Nota Fiscal:
                              </span>
                              <Badge
                                className={
                                  fiscal?.invoiceDescriptionType === "water"
                                    ? "bg-sky-600 text-white text-xs"
                                    : fiscal?.invoiceDescriptionType === "minibar_consumption"
                                    ? "bg-amber-600 text-white text-xs"
                                    : "bg-indigo-600 text-white text-xs"
                                }
                              >
                                {fiscal?.invoiceDescriptionLabel || "1. Discriminar todos os itens"}
                              </Badge>
                            </div>

                            <div className="bg-slate-50 dark:bg-slate-950 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 font-mono leading-relaxed break-words">
                              {fiscal?.readyToPasteDescription}
                            </div>

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                handleCopy(
                                  fiscal?.readyToPasteDescription || "",
                                  `desc-${order.id}`,
                                  "Descrição para a Nota Fiscal"
                                )
                              }
                              className="w-full h-8 text-xs font-semibold border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                            >
                              {copiedKey === `desc-${order.id}` ? (
                                <>
                                  <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
                                  Descrição Copiada!
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5 mr-1.5" />
                                  Copiar Descrição Pronta para a Nota Fiscal
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* COLUNA 3 (3 cols): Anexar Nota Fiscal e Monitor de Entrega */}
                      <div className="lg:col-span-3 flex flex-col justify-between gap-3 bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                        {!isIssued ? (
                          <div className="space-y-3 my-auto text-center">
                            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
                              <Upload className="w-6 h-6" />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-900 dark:text-white">
                                Aguardando Emissão da NF
                              </p>
                              <p className="text-xs text-slate-500 mt-0.5">
                                Anexe o PDF ou foto da Nota Fiscal emitida. O sistema envia na hora para o WhatsApp e E-mail do hóspede!
                              </p>
                            </div>
                            <Button
                              onClick={() => openUploadModal(order)}
                              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-sm"
                            >
                              <Upload className="w-4 h-4 mr-2" />
                              Anexar Nota Fiscal
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <Badge className="bg-emerald-600 text-white text-xs">
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                                NF Anexada
                              </Badge>
                              {order.invoice?.invoiceNumber && (
                                <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                                  Nº {order.invoice.invoiceNumber}
                                </span>
                              )}
                            </div>

                            <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                              <p>
                                <strong>Anexada em:</strong> {formatDateTimeBr(order.invoice?.attachedAt)}
                              </p>
                              {order.invoice?.invoiceFileUrl && (
                                <a
                                  href={order.invoice.invoiceFileUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-indigo-600 hover:underline font-semibold mt-1"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                  Abrir Arquivo da Nota Fiscal
                                </a>
                              )}
                            </div>

                            {/* Status de Entrega WhatsApp + E-mail */}
                            <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
                              <p className="text-[10px] font-bold uppercase text-slate-400">
                                Monitor de Entrega ao Hóspede:
                              </p>
                              <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
                                  <MessageSquare className="w-3.5 h-3.5 text-emerald-600" /> WhatsApp:
                                </span>
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] ${
                                    monitor?.whatsapp?.status === "enviado"
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                                      : "bg-rose-50 text-rose-700 border-rose-300"
                                  }`}
                                >
                                  {monitor?.whatsapp?.status || "enviado"}
                                </Badge>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
                                  <Mail className="w-3.5 h-3.5 text-indigo-600" /> E-mail:
                                </span>
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] ${
                                    monitor?.email?.status === "enviado" || monitor?.email?.status === "enviando"
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                                      : "bg-rose-50 text-rose-700 border-rose-300"
                                  }`}
                                >
                                  {monitor?.email?.status || "enviado"}
                                </Badge>
                              </div>
                            </div>

                            <div className="flex flex-col gap-2 pt-1">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openRetryModal(order)}
                                className="w-full text-xs"
                              >
                                <Send className="w-3.5 h-3.5 mr-1.5" />
                                Reenviar / Corrigir Contato
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openUploadModal(order)}
                                className="w-full text-xs text-slate-600"
                              >
                                <Upload className="w-3.5 h-3.5 mr-1.5" />
                                Substituir Arquivo da NF
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal para Anexar Nota Fiscal */}
      <Dialog open={uploadModalOpen} onOpenChange={setUploadModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-600" />
              Anexar Nota Fiscal — Flat {selectedOrder?.flatNumber}
            </DialogTitle>
            <DialogDescription>
              Ao confirmar, o sistema enviará automaticamente a Nota Fiscal pelo WhatsApp e E-mail de{" "}
              <strong>{selectedOrder?.fiscalSummary?.payerName || selectedOrder?.guestName}</strong>.
            </DialogDescription>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-4 py-2">
              <div className="bg-slate-50 dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Tomador:</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {selectedOrder.fiscalSummary?.payerName}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{selectedOrder.fiscalSummary?.documentType || "CPF"}:</span>
                  <span className="font-mono font-bold">
                    {formatDocBr(selectedOrder.fiscalSummary?.documentNumber || "")}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Valor da Nota:</span>
                  <span className="font-extrabold text-emerald-700">
                    R$ {Number(selectedOrder.totalAmount || 0).toFixed(2).replace(".", ",")}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Preferência na NF:</span>
                  <span className="font-semibold text-indigo-700">
                    {selectedOrder.fiscalSummary?.invoiceDescriptionLabel}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="nf-number">Número da Nota Fiscal (opcional)</Label>
                <Input
                  id="nf-number"
                  placeholder="Ex: NF-001245"
                  value={invoiceNumberInput}
                  onChange={e => setInvoiceNumberInput(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="nf-file">Arquivo da Nota Fiscal (PDF ou Imagem) *</Label>
                <Input
                  id="nf-file"
                  type="file"
                  accept=".pdf,image/*"
                  onChange={handleFileChange}
                  className="cursor-pointer"
                />
                {selectedFileName && (
                  <p className="text-xs text-emerald-600 font-semibold flex items-center gap-1.5 mt-1">
                    <CheckCircle2 className="w-4 h-4" />
                    Arquivo selecionado: {selectedFileName}
                  </p>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setUploadModalOpen(false)} disabled={uploadingInvoice}>
              Cancelar
            </Button>
            <Button
              onClick={handleAttachInvoice}
              disabled={uploadingInvoice || !selectedFileBase64}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
            >
              {uploadingInvoice ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Enviando NF...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Anexar e Enviar ao Hóspede
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Reenvio / Correção de Contato */}
      <Dialog open={retryModalOpen} onOpenChange={setRetryModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reenviar Nota Fiscal — Flat {retryOrder?.flatNumber}</DialogTitle>
            <DialogDescription>
              Verifique ou corrija o WhatsApp e E-mail do hóspede para disparar novamente a Nota Fiscal.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>WhatsApp do Hóspede (com DDD)</Label>
              <Input
                value={retryPhone}
                onChange={e => setRetryPhone(e.target.value)}
                placeholder="Ex: 5522999999999"
              />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail do Hóspede</Label>
              <Input
                value={retryEmail}
                onChange={e => setRetryEmail(e.target.value)}
                placeholder="hospede@email.com"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRetryModalOpen(false)} disabled={retryingSend}>
              Cancelar
            </Button>
            <Button
              onClick={handleRetryDelivery}
              disabled={retryingSend}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {retryingSend ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Reenviando...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Reenviar Agora
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}
