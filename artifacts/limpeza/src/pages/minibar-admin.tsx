import React, { useState, useEffect, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { Shell } from "@/components/layout";
import { MinibarEcosystemNav } from "@/components/minibar-ecosystem-nav";
import { MinibarCollectionsPanel } from "@/components/minibar-collections-panel";
import { MinibarSalesTab } from "@/components/minibar/minibar-sales-tab";
import { MinibarInspectionsTab } from "@/components/minibar/minibar-inspections-tab";
import { FrigobarPicture } from "@/components/frigobar-picture";
import { useGetMe } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import {
  Bell,
  Package,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  Search,
  Sliders,
  DollarSign,
  Coffee,
  Check,
  X,
  Building2,
  Calendar,
  Layers,
  BarChart3,
  TrendingUp,
  MapPin,
  Users,
  UserPlus,
  Key,
  Award,
  Download,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Eye,
  Phone,
  Send,
  ShoppingBag,
  Briefcase,
  RotateCcw,
  FileText,
  ClipboardList
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";

export interface MinibarProduct {
  id: string;
  name: string;
  category: string;
  price: number;
  cost?: number;
  description?: string;
  imageUrl?: string;
  isCourtesy?: boolean;
  courtesyLimit?: number;
  extraPaidProductId?: string;
  defaultQuantity?: number;
  active?: boolean;
  sortOrder?: number;
}

export interface DefaultStockData {
  globalTemplate?: Array<{ productId: string; quantity?: number; defaultQuantity?: number }> | Record<string, number>;
  flatOverrides?: Record<string, Array<{ productId: string; quantity?: number; defaultQuantity?: number }>>;
  courtesyItems?: Array<{ productId: string; freeQuantity: number }>;
}

const SOHO_FLATS = [
  "101", "102", "113", "114", "116", "211", "212", "215",
  "313", "408", "509", "511", "512", "605", "712", "715",
  "904", "905", "907", "1004", "1304"
];

const CATEGORIES = [
  "Bebidas",
  "Petiscos",
  "Kit de Boas-Vindas",
  "Água & Sucos",
  "Refrigerantes",
  "Cervejas & Alcoólicos",
  "Snacks & Chocolates",
  "Cafés & Especiais"
];

type MinibarUnifiedTab =
  | "vendas"
  | "cobrancas"
  | "passagens"
  | "catalogo"
  | "equipe"
  | "insights";

const VALID_UNIFIED_TABS = new Set<MinibarUnifiedTab>([
  "vendas",
  "cobrancas",
  "passagens",
  "catalogo",
  "equipe",
  "insights"
]);

function downloadCsvFile(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const escapeCsvCell = (val: string | number) => {
    const str = String(val ?? "").replace(/"/g, '""');
    return `"${str}"`;
  };
  const csvContent =
    "\uFEFF" +
    [headers.map(escapeCsvCell).join(";"), ...rows.map(r => r.map(escapeCsvCell).join(";"))].join("\r\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function MinibarAdminPage() {
  const [, setLocation] = useLocation();
  const { data: user } = useGetMe();
  const { toast } = useToast();

  const isCorpFlatsAdmin = user?.role === "admin" || user?.role === "dev";

  const [activeTab, setActiveTab] = useState<MinibarUnifiedTab>(() => {
    if (typeof window !== "undefined") {
      const tabParam = new URLSearchParams(window.location.search).get("tab")?.toLowerCase().trim() as
        | MinibarUnifiedTab
        | undefined;
      if (tabParam && VALID_UNIFIED_TABS.has(tabParam)) {
        return tabParam;
      }
    }
    return "vendas";
  });

  useEffect(() => {
    if (!user) return;
    if (!isCorpFlatsAdmin && (activeTab === "catalogo" || activeTab === "insights")) {
      setActiveTab("vendas");
    }
  }, [user, isCorpFlatsAdmin, activeTab]);

  const [collectionsPendingCount, setCollectionsPendingCount] = useState<number>(0);
  const [collectionsSuspiciousCount, setCollectionsSuspiciousCount] = useState<number>(0);
  const [pendingInvoicesCount, setPendingInvoicesCount] = useState<number>(0);
  const [insightsSubView, setInsightsSubView] = useState<
    "visao_geral" | "produtos_flats" | "perfil_hospedes"
  >("visao_geral");
  const [catalogSubView, setCatalogSubView] = useState<
    "produtos" | "gabarito" | "estoque_amendoim"
  >("produtos");

  // Sales & Reports State (Vendas & Repasse + Passagens nos Flats)
  const [reportsData, setReportsData] = useState<any | null>(null);
  const [salesFlatFilter, setSalesFlatFilter] = useState<string>("todos");
  const [salesStatusFilter, setSalesStatusFilter] = useState<string>("todos");
  const [salesSearch, setSalesSearch] = useState<string>("");
  const [reopenSalesOrder, setReopenSalesOrder] = useState<any | null>(null);
  const [reopenSalesReason, setReopenSalesReason] = useState<string>("");
  const [reopenSalesError, setReopenSalesError] = useState<string | null>(null);
  const [reopeningSalesOrder, setReopeningSalesOrder] = useState<boolean>(false);
  const reopenSalesReasonRef = useRef<HTMLTextAreaElement>(null);

  // Catalog State
  const [products, setProducts] = useState<MinibarProduct[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("todas");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Product Modal State
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<MinibarProduct | null>(null);
  const [pName, setPName] = useState("");
  const [pCategory, setPCategory] = useState("Água & Sucos");
  const [pPrice, setPPrice] = useState("");
  const [pCost, setPCost] = useState("");
  const [pDescription, setPDescription] = useState("");
  const [pImageUrl, setPImageUrl] = useState("");
  const [pIsCourtesy, setPIsCourtesy] = useState(false);
  const [pDefaultQty, setPDefaultQty] = useState("2");
  const [savingProduct, setSavingProduct] = useState(false);

  // Default Stock State
  const [defaultStock, setDefaultStock] = useState<DefaultStockData | null>(null);
  const [selectedFlatForStock, setSelectedFlatForStock] = useState<string>("global");
  const [stockQuantities, setStockQuantities] = useState<Record<string, number>>({});
  const [savingStock, setSavingStock] = useState(false);

  // Date Filters & Extrato / Insights State
  const [extratoStartDate, setExtratoStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [extratoEndDate, setExtratoEndDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });
  const [settlementData, setSettlementData] = useState<any>(null);
  const [insightsData, setInsightsData] = useState<any>(null);
  const [peanutStock, setPeanutStock] = useState<any>(null);
  const [peanutMovType, setPeanutMovType] = useState<"entry" | "set_balance" | "manual_out">("entry");
  const [peanutMovQty, setPeanutMovQty] = useState("");
  const [peanutMovThreshold, setPeanutMovThreshold] = useState("30");
  const [peanutMovCost, setPeanutMovCost] = useState("");
  const [peanutMovNotes, setPeanutMovNotes] = useState("");
  const [savingPeanutStock, setSavingPeanutStock] = useState(false);

  // Staff Management State (Both Gestores & Repositoras Anserve)
  const [staffList, setStaffList] = useState<any[]>([]);
  const [staffRoleFilter, setStaffRoleFilter] = useState<string>("todos");
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<any | null>(null);
  const [sName, setSName] = useState("");
  const [sUsername, setSUsername] = useState("");
  const [sPassword, setSPassword] = useState("");
  const [sRole, setSRole] = useState<"anserve_repositora" | "anserve_gestor" | "anserve_faturamento">("anserve_repositora");
  const [sWhatsapp, setSWhatsapp] = useState("");
  const [sPixKey, setSPixKey] = useState("");
  const [sPin, setSPin] = useState("");
  const [sActive, setSActive] = useState(true);
  const [savingStaff, setSavingStaff] = useState(false);

  const [resetModalStaff, setResetModalStaff] = useState<any | null>(null);
  const [resetPasswordInput, setResetPasswordInput] = useState("");
  const [resetPinInput, setResetPinInput] = useState("");
  const [savingReset, setSavingReset] = useState(false);

  const [historyModalStaff, setHistoryModalStaff] = useState<any | null>(null);

  // Invoice Delivery Monitor & Manual Retry Modal
  const [deliveryMonitor, setDeliveryMonitor] = useState<any | null>(null);
  const [retryModalOrder, setRetryModalOrder] = useState<any | null>(null);
  const [retryPhoneInput, setRetryPhoneInput] = useState("");
  const [retryEmailInput, setRetryEmailInput] = useState("");
  const [retryingInvoice, setRetryingInvoice] = useState(false);

  // WhatsApp Exclusivo de Trabalho das Repositoras & Resumo de Check-outs
  const [restockerWorkWhatsapp, setRestockerWorkWhatsapp] = useState("");
  const [savingWorkWhatsapp, setSavingWorkWhatsapp] = useState(false);
  const [sendingTestSummary, setSendingTestSummary] = useState(false);
  const [checkoutSummary, setCheckoutSummary] = useState<any | null>(null);

  const fetchMinibarSettings = async () => {
    try {
      const res = await fetch("/api/minibar/settings", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setRestockerWorkWhatsapp(data.settings?.restockerWorkWhatsapp || "");
          if (data.checkoutSummary) {
            setCheckoutSummary(data.checkoutSummary);
          }
        }
      }
    } catch (err) {
      console.error("[MinibarAdmin] Erro ao buscar configurações do frigobar:", err);
    }
  };

  const handleSaveRestockerWorkWhatsapp = async () => {
    setSavingWorkWhatsapp(true);
    try {
      const res = await fetch("/api/minibar/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          restockerWorkWhatsapp: restockerWorkWhatsapp.trim()
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({
          title: "WhatsApp de Trabalho salvo! 📱",
          description: "Os avisos de check-out e o resumo do 1º login do dia serão enviados para este número."
        });
      } else {
        toast({
          title: "Erro ao salvar WhatsApp",
          description: data.error || "Tente novamente.",
          variant: "destructive"
        });
      }
    } catch (err: any) {
      toast({
        title: "Erro de comunicação",
        description: err.message,
        variant: "destructive"
      });
    } finally {
      setSavingWorkWhatsapp(false);
    }
  };

  const handleSendTestCheckoutSummary = async () => {
    setSendingTestSummary(true);
    try {
      const res = await fetch("/api/minibar/test-checkout-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include"
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.checkoutSummary) setCheckoutSummary(data.checkoutSummary);
        toast({
          title: "Resumo de Check-outs enviado! ✅",
          description: "A mensagem foi disparada para o WhatsApp de Trabalho das Repositoras."
        });
      } else {
        toast({
          title: "Não foi possível enviar",
          description: data.error || "Cadastre e salve o número do WhatsApp de Trabalho primeiro.",
          variant: "destructive"
        });
      }
    } catch (err: any) {
      toast({
        title: "Erro de comunicação",
        description: err.message,
        variant: "destructive"
      });
    } finally {
      setSendingTestSummary(false);
    }
  };

  const fetchDeliveryMonitor = async () => {
    try {
      const res = await fetch("/api/minibar/invoices/delivery-monitor", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setDeliveryMonitor(data);
        }
      }
    } catch (err) {
      console.error("[MinibarAdmin] Erro ao buscar monitor de entrega de NF:", err);
    }
  };

  const handleOpenRetryModal = (ord: any) => {
    setRetryModalOrder(ord);
    setRetryPhoneInput(ord.guestPhone || "");
    setRetryEmailInput(ord.guestEmail || "");
  };

  const handleConfirmRetryInvoice = async () => {
    if (!retryModalOrder) return;
    setRetryingInvoice(true);
    try {
      const res = await fetch(`/api/minibar/orders/${retryModalOrder.id}/invoice/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          phone: retryPhoneInput.trim() || undefined,
          email: retryEmailInput.trim() || undefined,
          channel: "both"
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({
          title: "Reenvio de Nota Fiscal disparado! 🚀",
          description: `WhatsApp (${retryPhoneInput || "cadastrado"}) e E-mail (${retryEmailInput || "cadastrado"}) atualizados e acionados.`
        });
        setRetryModalOrder(null);
        fetchDeliveryMonitor();
      } else {
        toast({
          title: "Erro ao reenviar NF",
          description: data.error || "Verifique os dados e tente novamente.",
          variant: "destructive"
        });
      }
    } catch (err: any) {
      toast({
        title: "Erro de comunicação",
        description: err.message,
        variant: "destructive"
      });
    } finally {
      setRetryingInvoice(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await fetch("/api/minibar/products", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.products)) {
          setProducts(data.products);
        }
      }
    } catch (err) {
      console.error("[MinibarAdmin] Erro ao carregar produtos:", err);
    }
  };

  const fetchDefaultStock = async () => {
    try {
      const res = await fetch("/api/minibar/default-stock", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setDefaultStock(data);
          loadQuantitiesForFlat(selectedFlatForStock, data);
        }
      }
    } catch (err) {
      console.error("[MinibarAdmin] Erro ao carregar gabarito padrão:", err);
    }
  };

  const fetchSettlement = async () => {
    try {
      const res = await fetch(
        `/api/minibar/settlement?startDate=${extratoStartDate}&endDate=${extratoEndDate}`,
        { credentials: "include" }
      );
      if (res.ok) {
        const data = await res.json();
        setSettlementData(data);
      }
    } catch (err) {
      console.error("[MinibarAdmin] Erro ao carregar extrato:", err);
    }
  };

  const fetchPeanutStock = async () => {
    try {
      const res = await fetch(
        `/api/minibar/peanut-stock?startDate=${extratoStartDate}&endDate=${extratoEndDate}`,
        { credentials: "include" }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.peanutStock) {
          setPeanutStock(data.peanutStock);
          if (data.peanutStock.minAlertThreshold !== undefined) {
            setPeanutMovThreshold(String(data.peanutStock.minAlertThreshold));
          }
          if (data.peanutStock.ownUnitCost !== undefined && Number(data.peanutStock.ownUnitCost) > 0) {
            setPeanutMovCost(prev => (prev === "" ? String(data.peanutStock.ownUnitCost) : prev));
          }
        }
      }
    } catch (err) {
      console.error("[MinibarAdmin] Erro ao carregar estoque de amendoim:", err);
    }
  };

  const handleSubmitPeanutMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedQty = Math.round(Number(String(peanutMovQty).replace(",", ".")));
    if (
      !Number.isFinite(parsedQty) ||
      (peanutMovType === "set_balance" ? parsedQty < 0 : parsedQty <= 0)
    ) {
      toast({
        title: "Quantidade inválida",
        description:
          peanutMovType === "set_balance"
            ? "Informe um saldo físico inteiro maior ou igual a 0."
            : "Informe uma quantidade inteira maior que zero.",
        variant: "destructive"
      });
      return;
    }

    setSavingPeanutStock(true);
    try {
      const parsedThreshold = peanutMovThreshold.trim()
        ? Math.max(0, Math.round(Number(peanutMovThreshold.replace(",", "."))))
        : undefined;
      const parsedCost = peanutMovCost.trim()
        ? Math.max(0, Number(peanutMovCost.replace(",", ".")))
        : undefined;

      const res = await fetch(
        `/api/minibar/peanut-stock/movements?startDate=${extratoStartDate}&endDate=${extratoEndDate}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            type: peanutMovType,
            quantity: parsedQty,
            minAlertThreshold: Number.isFinite(parsedThreshold) ? parsedThreshold : undefined,
            unitCost: parsedCost !== undefined && Number.isFinite(parsedCost) ? parsedCost : undefined,
            notes: peanutMovNotes.trim()
          })
        }
      );
      const data = await res.json();
      if (res.ok && data.success) {
        setPeanutStock(data.peanutStock);
        setPeanutMovQty("");
        setPeanutMovNotes("");
        await Promise.all([fetchProducts(), fetchSettlement()]);
        toast({
          title: "Estoque de amendoim atualizado! 🥜",
          description: `Saldo atual registrado: ${data.peanutStock?.currentBalance ?? 0} unidades (repasse Anserve R$ 0,00).`
        });
      } else {
        toast({
          title: "Erro ao atualizar estoque",
          description: data.error || "Não foi possível gravar a movimentação.",
          variant: "destructive"
        });
      }
    } catch (err: any) {
      toast({
        title: "Erro de comunicação",
        description: err.message,
        variant: "destructive"
      });
    } finally {
      setSavingPeanutStock(false);
    }
  };

  const handleDeletePeanutMovement = async (mov: any) => {
    if (!confirm("Excluir esta movimentação manual do histórico de estoque do amendoim?")) return;
    try {
      const res = await fetch(
        `/api/minibar/peanut-stock/movements/${encodeURIComponent(mov.id)}?startDate=${extratoStartDate}&endDate=${extratoEndDate}`,
        {
          method: "DELETE",
          credentials: "include"
        }
      );
      const data = await res.json();
      if (res.ok && data.success) {
        setPeanutStock(data.peanutStock);
        toast({
          title: "Movimentação removida",
          description: `Saldo recalculado para ${data.peanutStock?.currentBalance ?? 0} un.`
        });
      } else {
        toast({
          title: "Erro ao excluir movimentação",
          description: data.error || "Tente novamente.",
          variant: "destructive"
        });
      }
    } catch (err: any) {
      toast({
        title: "Erro de comunicação",
        description: err.message,
        variant: "destructive"
      });
    }
  };

  const handleExportPeanutStockCsv = () => {
    const byFlat = peanutStock?.byFlat || [];
    const movs = peanutStock?.movements || [];
    const headers = [
      "Seção",
      "Referência / Flat / Data",
      "Descrição / Tipo",
      "Qtd Hóspedes",
      "Qtd Ajustes Internos",
      "Total / Impacto Saldo",
      "Repasse Anserve (R$)",
      "Observação / Responsável"
    ];
    const rows: Array<Array<string | number>> = [
      [
        "RESUMO",
        `${extratoStartDate} a ${extratoEndDate}`,
        "Saldo Atual Estoque Próprio CorpFlats",
        peanutStock?.periodGuestConsumed || 0,
        peanutStock?.periodInternalConsumed || 0,
        peanutStock?.currentBalance ?? 0,
        "0,00",
        `Fornecimento Próprio CorpFlats • Mín. Alerta: ${peanutStock?.minAlertThreshold ?? 30} un.`
      ],
      ...byFlat.map((f: any) => [
        "CONSUMO_POR_FLAT",
        `Flat ${f.flatNumber}`,
        "Saída automática nas conferências",
        f.guestConsumed || 0,
        f.internalConsumed || 0,
        f.totalConsumed || 0,
        "0,00",
        "Controle interno CorpFlats"
      ]),
      ...movs.map((m: any) => [
        "MOVIMENTACAO_MANUAL",
        m.createdAt ? new Date(m.createdAt).toLocaleString("pt-BR") : "",
        m.type === "entry" ? "Entrada Compra" : m.type === "set_balance" ? "Inventário Físico" : "Baixa Manual",
        "-",
        "-",
        m.delta >= 0 ? `+${m.delta}` : String(m.delta),
        "0,00",
        `${m.notes || "-"} (${m.createdBy || "Admin"})`
      ])
    ];
    downloadCsvFile(`corpflats_estoque_amendoim_${extratoStartDate}_a_${extratoEndDate}.csv`, headers, rows);
  };

  const fetchInsights360 = async () => {
    try {
      const res = await fetch(
        `/api/minibar/analytics/insights-360?startDate=${extratoStartDate}&endDate=${extratoEndDate}`,
        { credentials: "include" }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setInsightsData(data);
        }
      }
    } catch (err) {
      console.error("[MinibarAdmin] Erro ao carregar Insights 360:", err);
    }
  };

  const fetchAnsReports = async () => {
    try {
      const params = new URLSearchParams({
        startDate: extratoStartDate,
        endDate: extratoEndDate,
        flatNumber: salesFlatFilter,
        status: salesStatusFilter
      });
      const res = await fetch(`/api/minibar/anserve-reports?${params.toString()}`, {
        credentials: "include"
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setReportsData(data);
        }
      }
    } catch (err) {
      console.error("[MinibarAdmin] Erro ao carregar relatórios de vendas/passagens:", err);
    }
  };

  const fetchPendingInvoicesCount = async () => {
    try {
      const res = await fetch("/api/minibar/invoices/pending", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.pendingInvoices)) {
          setPendingInvoicesCount(data.pendingInvoices.length);
        }
      }
    } catch (err) {
      console.error("[MinibarAdmin] Erro ao buscar NFs pendentes:", err);
    }
  };

  const fetchAnserveStaff = async () => {
    try {
      const res = await fetch(
        `/api/minibar/staff?startDate=${extratoStartDate}&endDate=${extratoEndDate}`,
        { credentials: "include" }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.staff)) {
          setStaffList(data.staff);
        }
      }
    } catch (err) {
      console.error("[MinibarAdmin] Erro ao carregar equipe Anserve:", err);
    }
  };

  const fetchCollectionsBadgeSummary = async () => {
    try {
      const res = await fetch("/api/minibar/collections/overview", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.summary) {
          setCollectionsPendingCount(Number(data.summary.pendingTargetsCount || 0));
          setCollectionsSuspiciousCount(Number(data.summary.suspiciousPaidOrdersCount || 0));
        }
      }
    } catch (err) {
      console.error("[MinibarAdmin] Erro ao carregar resumo de cobranças:", err);
    }
  };

  const loadAll = async () => {
    setRefreshing(true);
    try {
      const tasks: Array<Promise<any>> = [
        fetchSettlement(),
        fetchAnsReports(),
        fetchPendingInvoicesCount(),
        fetchAnserveStaff(),
        fetchDeliveryMonitor(),
        fetchMinibarSettings(),
        fetchCollectionsBadgeSummary()
      ];
      if (isCorpFlatsAdmin) {
        tasks.push(
          fetchProducts(),
          fetchDefaultStock(),
          fetchPeanutStock(),
          fetchInsights360()
        );
      }
      await Promise.all(tasks);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    loadAll();
  }, [user?.role, extratoStartDate, extratoEndDate, salesFlatFilter, salesStatusFilter]);

  const loadQuantitiesForFlat = (flatKey: string, stockData: DefaultStockData | null) => {
    const data = stockData || defaultStock;
    if (!data) return;

    const map: Record<string, number> = {};
    if (flatKey === "global") {
      const template = data.globalTemplate;
      if (Array.isArray(template)) {
        template.forEach(item => {
          map[item.productId] = Number(item.quantity ?? item.defaultQuantity) || 0;
        });
      } else if (template && typeof template === "object") {
        Object.entries(template).forEach(([pid, qty]) => {
          map[pid] = Number(qty) || 0;
        });
      }
    } else {
      const override = data.flatOverrides?.[flatKey];
      if (Array.isArray(override)) {
        override.forEach(item => {
          map[item.productId] = Number(item.quantity ?? item.defaultQuantity) || 0;
        });
      } else {
        const template = data.globalTemplate;
        if (Array.isArray(template)) {
          template.forEach(item => {
            map[item.productId] = Number(item.quantity ?? item.defaultQuantity) || 0;
          });
        }
      }
    }
    setStockQuantities(map);
  };

  const handleSelectFlatForStock = (flatKey: string) => {
    setSelectedFlatForStock(flatKey);
    loadQuantitiesForFlat(flatKey, defaultStock);
  };

  const handleOpenProductModal = (product?: MinibarProduct) => {
    if (product) {
      setEditingProduct(product);
      setPName(product.name);
      setPCategory(product.category || "Água & Sucos");
      setPPrice(String(product.price));
      setPCost(product.cost ? String(product.cost) : "");
      setPDescription(product.description || "");
      setPImageUrl(product.imageUrl || "");
      setPIsCourtesy(Boolean(product.isCourtesy));
      setPDefaultQty(String(product.defaultQuantity || 2));
    } else {
      setEditingProduct(null);
      setPName("");
      setPCategory("Água & Sucos");
      setPPrice("");
      setPCost("");
      setPDescription("");
      setPImageUrl("");
      setPIsCourtesy(false);
      setPDefaultQty("2");
    }
    setProductModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pName.trim() || !pPrice) {
      toast({
        title: "Campos obrigatórios",
        description: "Nome e preço de venda são obrigatórios.",
        variant: "destructive"
      });
      return;
    }

    setSavingProduct(true);
    try {
      const payload = {
        name: pName.trim(),
        category: pCategory,
        price: parseFloat(pPrice.replace(",", ".")),
        cost: pCost ? parseFloat(pCost.replace(",", ".")) : 0,
        description: pDescription.trim(),
        imageUrl: pImageUrl.trim(),
        isCourtesy: pIsCourtesy,
        defaultQuantity: parseInt(pDefaultQty) || 2
      };

      const res = await fetch(
        editingProduct ? `/api/minibar/products/${editingProduct.id}` : "/api/minibar/products",
        {
          method: editingProduct ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload)
        }
      );

      const data = await res.json();
      if (res.ok && data.success) {
        toast({
          title: editingProduct ? "Produto atualizado! ✨" : "Produto cadastrado com sucesso! ✨",
          description: `${payload.name} salvo no catálogo de frigobar.`
        });
        setProductModalOpen(false);
        fetchProducts();
        fetchSettlement();
        fetchPeanutStock();
        fetchInsights360();
      } else {
        toast({
          title: "Erro ao salvar produto",
          description: data.error || "Tente novamente.",
          variant: "destructive"
        });
      }
    } catch (err: any) {
      toast({
        title: "Erro de comunicação",
        description: err.message,
        variant: "destructive"
      });
    } finally {
      setSavingProduct(false);
    }
  };

  const handleSaveDefaultStock = async () => {
    setSavingStock(true);
    try {
      const templateList = Object.entries(stockQuantities).map(([productId, quantity]) => ({
        productId,
        quantity: Math.max(0, quantity),
        defaultQuantity: Math.max(0, quantity)
      }));

      const bodyPayload =
        selectedFlatForStock === "global"
          ? { globalTemplate: templateList }
          : { flatNumber: selectedFlatForStock, items: templateList };

      const res = await fetch("/api/minibar/default-stock", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(bodyPayload)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast({
          title: "Gabarito padrão atualizado com sucesso! ✅",
          description:
            selectedFlatForStock === "global"
              ? "Padrão nominal global salvo para todos os flats."
              : `Padrão exclusivo salvo para o Flat ${selectedFlatForStock}.`
        });
        fetchDefaultStock();
      } else {
        toast({
          title: "Erro ao atualizar gabarito",
          description: data.error || "Tente novamente.",
          variant: "destructive"
        });
      }
    } catch (err: any) {
      toast({
        title: "Erro de comunicação",
        description: err.message,
        variant: "destructive"
      });
    } finally {
      setSavingStock(false);
    }
  };

  // Staff CRUD Handlers (Admin manages Gestores, Repositoras and Emissão NF)
  const handleOpenCreateStaff = (
    defaultRole: "anserve_repositora" | "anserve_gestor" | "anserve_faturamento" = "anserve_repositora"
  ) => {
    setEditingStaff(null);
    setSName("");
    setSUsername("");
    setSPassword("");
    setSRole(defaultRole);
    setSWhatsapp("");
    setSPixKey("");
    setSPin("");
    setSActive(true);
    setStaffModalOpen(true);
  };

  const handleOpenEditStaff = (member: any) => {
    setEditingStaff(member);
    setSName(member.name || member.username);
    setSUsername(member.username);
    setSPassword("");
    setSRole(
      member.role === "anserve_gestor"
        ? "anserve_gestor"
        : member.role === "anserve_faturamento"
        ? "anserve_faturamento"
        : "anserve_repositora"
    );
    setSWhatsapp(member.whatsapp || member.phone || "");
    setSPixKey(member.pixKey || "");
    setSPin(member.pin || "");
    setSActive(member.active !== false);
    setStaffModalOpen(true);
  };

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sUsername.trim() || !sName.trim()) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha o nome e o login (@usuário).",
        variant: "destructive"
      });
      return;
    }

    if (!editingStaff && sPassword.trim().length < 4) {
      toast({
        title: "Senha inválida",
        description: "A senha inicial deve ter no mínimo 4 caracteres.",
        variant: "destructive"
      });
      return;
    }

    setSavingStaff(true);
    try {
      const url = editingStaff ? `/api/minibar/staff/${editingStaff.id}` : "/api/minibar/staff";
      const method = editingStaff ? "PATCH" : "POST";
      const payload: any = {
        name: sName.trim(),
        username: sUsername.trim(),
        role: sRole,
        whatsapp: sWhatsapp.trim(),
        phone: sWhatsapp.trim(),
        pixKey: sPixKey.trim(),
        pin: sPin.replace(/\D/g, "").slice(0, 6),
        active: sActive
      };
      if (!editingStaff) {
        payload.password = sPassword.trim();
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast({
          title: editingStaff ? "Cadastro atualizado! ✅" : "Colaborador Anserve criado! 🎉",
          description: `${sName.trim()} (${sRole === "anserve_gestor" ? "Gestor Anserve" : "Repositora"}) salvo com sucesso.`
        });
        setStaffModalOpen(false);
        fetchAnserveStaff();
      } else {
        toast({
          title: "Erro ao salvar",
          description: data.error || "Verifique os dados informados.",
          variant: "destructive"
        });
      }
    } catch (err: any) {
      toast({
        title: "Erro de comunicação",
        description: err.message,
        variant: "destructive"
      });
    } finally {
      setSavingStaff(false);
    }
  };

  const handleResetStaffCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetModalStaff) return;
    setSavingReset(true);
    try {
      const bodyPayload: any = {};
      if (resetPasswordInput.trim()) bodyPayload.newPassword = resetPasswordInput.trim();
      if (resetPinInput !== "") bodyPayload.newPin = resetPinInput.replace(/\D/g, "").slice(0, 6);

      const res = await fetch(`/api/minibar/staff/${resetModalStaff.id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(bodyPayload)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({
          title: "Credenciais redefinidas! 🔐",
          description: data.message
        });
        setResetModalStaff(null);
        setResetPasswordInput("");
        setResetPinInput("");
        fetchAnserveStaff();
      } else {
        toast({
          title: "Erro ao redefinir",
          description: data.error || "Tente novamente.",
          variant: "destructive"
        });
      }
    } catch (err: any) {
      toast({
        title: "Erro de comunicação",
        description: err.message,
        variant: "destructive"
      });
    } finally {
      setSavingReset(false);
    }
  };

  const handleDeleteStaff = async (member: any) => {
    if (!confirm(`Tem certeza que deseja excluir "${member.name}" (@${member.username})?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/minibar/staff/${member.id}`, {
        method: "DELETE",
        credentials: "include"
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({
          title: "Colaborador excluído",
          description: `${member.name} foi removido do sistema.`
        });
        fetchAnserveStaff();
      } else {
        toast({
          title: "Erro ao excluir",
          description: data.error || "Não foi possível excluir.",
          variant: "destructive"
        });
      }
    } catch (err: any) {
      toast({
        title: "Erro de conexão",
        description: err.message,
        variant: "destructive"
      });
    }
  };

  // CSV Exports for Insights 360
  const handleExportDemographicsCsv = () => {
    const list = insightsData?.byState || [];
    if (list.length === 0) return;
    downloadCsvFile(
      `corpflats_insights_estados_${extratoStartDate}_a_${extratoEndDate}.csv`,
      ["UF", "Pedidos", "Unidades", "Receita (R$)", "Ticket Médio (R$)", "Participação (%)", "Categoria Favorita", "Produto Campeão"],
      list.map((s: any) => [
        s.state,
        s.ordersCount,
        s.units,
        Number(s.revenue).toFixed(2).replace(".", ","),
        Number(s.averageTicket).toFixed(2).replace(".", ","),
        String(s.sharePct).replace(".", ","),
        s.topCategory,
        s.topProduct
      ])
    );
  };

  const handleExportProductMatrixCsv = () => {
    const list = insightsData?.productMatrix || [];
    if (list.length === 0) return;
    downloadCsvFile(
      `corpflats_curva_abc_produtos_${extratoStartDate}_a_${extratoEndDate}.csv`,
      ["Classe ABC", "Produto", "Categoria", "Unidades Vendidas", "Preço Venda (R$)", "Custo Repasse (R$)", "Receita Bruta (R$)", "Lucro Líquido (R$)", "Margem (%)", "Share Receita (%)", "Diagnóstico"],
      list.map((p: any) => [
        p.abcClass,
        p.name,
        p.category,
        p.unitsSold,
        Number(p.unitPrice).toFixed(2).replace(".", ","),
        Number(p.unitCost).toFixed(2).replace(".", ","),
        Number(p.revenue).toFixed(2).replace(".", ","),
        Number(p.netProfit).toFixed(2).replace(".", ","),
        String(p.marginPct).replace(".", ","),
        String(p.shareOfRevenuePct).replace(".", ","),
        p.statusTag
      ])
    );
  };

  const handleExportFlatsRankingCsv = () => {
    const list = insightsData?.byFlat || [];
    if (list.length === 0) return;
    downloadCsvFile(
      `corpflats_ranking_flats_frigobar_${extratoStartDate}_a_${extratoEndDate}.csv`,
      ["Flat", "Pedidos", "Unidades Vendidas", "Receita (R$)", "Lucro (R$)", "Ticket Médio (R$)", "Vistorias", "Divergências", "Taxa Divergência (%)", "Custo Cortesias (R$)", "Produto Mais Vendido"],
      list.map((f: any) => [
        `Flat ${f.flatNumber}`,
        f.ordersCount,
        f.unitsSold,
        Number(f.revenue).toFixed(2).replace(".", ","),
        Number(f.netProfit).toFixed(2).replace(".", ","),
        Number(f.averageTicket).toFixed(2).replace(".", ","),
        f.inspectionsCount,
        f.discrepancyCount,
        String(f.discrepancyRatePct).replace(".", ","),
        Number(f.courtesyCost).toFixed(2).replace(".", ","),
        f.topProduct
      ])
    );
  };

  const handleDeleteMinibarOrder = async (order: any) => {
    if (
      !confirm(
        `Tem certeza que deseja excluir permanentemente o pedido "${order.id}" (Flat ${order.flatNumber} — R$ ${Number(order.totalAmount || 0).toFixed(2)}) do histórico de frigobar?`
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/minibar/orders/${encodeURIComponent(order.id)}`, {
        method: "DELETE",
        credentials: "include"
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({
          title: "Pedido excluído",
          description: data.message || `O pedido ${order.id} foi removido do histórico.`
        });
        loadAll();
      } else {
        toast({
          title: "Erro ao excluir pedido",
          description: data.error || "Não foi possível excluir este pedido.",
          variant: "destructive"
        });
      }
    } catch (err: any) {
      toast({
        title: "Erro de conexão",
        description: err.message,
        variant: "destructive"
      });
    }
  };

  const handleConfirmReopenSalesOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reopenSalesOrder) return;
    const trimmed = reopenSalesReason.trim();
    if (trimmed.length < 3) {
      setReopenSalesError("Informe o motivo da reabertura (mínimo de 3 caracteres).");
      reopenSalesReasonRef.current?.focus();
      return;
    }
    setReopenSalesError(null);
    setReopeningSalesOrder(true);
    try {
      const res = await fetch(`/api/minibar/orders/${encodeURIComponent(reopenSalesOrder.id)}/reopen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason: trimmed })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        toast({
          title: "Pedido reaberto como pendente!",
          description:
            data.message ||
            `Pedido ${reopenSalesOrder.id} (Flat ${reopenSalesOrder.flatNumber}) voltou para pendente.`
        });
        setReopenSalesOrder(null);
        setReopenSalesReason("");
        loadAll();
      } else {
        toast({
          title: "Erro ao reabrir pedido",
          description: data.error || "Não foi possível reabrir este pedido.",
          variant: "destructive"
        });
      }
    } catch (err: any) {
      toast({
        title: "Erro de conexão",
        description: err.message,
        variant: "destructive"
      });
    } finally {
      setReopeningSalesOrder(false);
    }
  };

  const handleExportSalesCsv = () => {
    const orders = filteredReportOrders;
    if (!orders || orders.length === 0) {
      toast({
        title: "Sem dados para exportar",
        description: "Não há vendas no período selecionado.",
        variant: "destructive"
      });
      return;
    }
    const headers = [
      "ID Pedido",
      "Data/Hora",
      "Flat",
      "Reserva",
      "Hóspede",
      "Documento NF",
      "Descrição NF Escolhida",
      "Status NF",
      "Método Pagamento",
      "Status Pagamento",
      "Qtd Itens",
      "Itens Consumidos",
      "Valor Venda (R$)",
      "Custo Repasse (R$)"
    ];
    const rows = orders.map((o: any) => [
      o.id,
      o.date ? new Date(o.date).toLocaleString("pt-BR") : "",
      `Flat ${o.flatNumber}`,
      o.reservationCode || "-",
      o.guestName || "-",
      o.documentNumber || "-",
      o.invoiceDescriptionType === "not_requested" || o.invoiceStatus === "dispensada"
        ? "Sem NF Solicitada"
        : o.invoiceDescriptionType === "water"
        ? "Água"
        : o.invoiceDescriptionType === "minibar_consumption"
        ? "Consumo de Frigobar"
        : "Itens Discriminados",
      o.invoiceStatus === "anexada"
        ? `Emitida (${o.invoiceNumber || "OK"})`
        : o.invoiceStatus === "dispensada"
        ? "Sem NF Solicitada"
        : o.invoiceStatus === "nao_aplicavel"
        ? "N/A"
        : "Pendente",
      o.paymentMethod === "pix" ? "PIX" : o.paymentMethod === "credit_card" ? "Cartão de Crédito" : "Pendente",
      o.paymentStatus === "pago" ? "Pago" : "Pendente",
      o.unitsCount || 0,
      o.itemsSummary || "",
      Number(o.totalAmount || 0).toFixed(2).replace(".", ","),
      Number(o.totalCost || 0).toFixed(2).replace(".", ",")
    ]);
    downloadCsvFile(`frigobar_vendas_${extratoStartDate}_a_${extratoEndDate}.csv`, headers, rows);
    toast({
      title: "Relatório de Vendas exportado! 📊",
      description: "O arquivo CSV foi gerado para abertura no Excel."
    });
  };

  const handleExportProductsCsv = () => {
    const prods = reportsData?.salesSummary?.byProduct || [];
    const courtesyItems = (
      reportsData?.courtesyReportItems ||
      reportsData?.salesSummary?.courtesyReportItems ||
      []
    ).filter((c: any) => Number(c?.unitsConsumed || 0) > 0);
    if (prods.length === 0 && courtesyItems.length === 0) {
      toast({
        title: "Sem produtos vendidos no período",
        description: "Não há saídas pagas ou cortesias para exportar.",
        variant: "destructive"
      });
      return;
    }
    const headers = [
      "ID Produto",
      "Produto",
      "Categoria",
      "Origem / Fornecedor",
      "Unidades Saída",
      "Preço Venda (R$)",
      "Faturamento Bruto (R$)",
      "Custo Unit. Repasse Anserve (R$)",
      "Total Repasse Anserve (R$)"
    ];
    const rows = [
      ...prods.map((p: any) => [
        p.productId,
        p.productName,
        p.category,
        p.productId === "prod_amendoim_mendorato"
          ? "CorpFlats Próprio (Controle de Estoque - Sem Repasse)"
          : "Anserve (Venda)",
        p.unitsSold,
        Number(p.unitPrice || 0).toFixed(2).replace(".", ","),
        Number(p.totalRevenue || 0).toFixed(2).replace(".", ","),
        Number(p.unitCost || 0).toFixed(2).replace(".", ","),
        Number(p.totalCost || 0).toFixed(2).replace(".", ",")
      ]),
      ...courtesyItems.map((c: any) => [
        c.productId,
        c.productName,
        c.category || "Kit de Boas-Vindas",
        c.supplier === "hotel_proprio"
          ? "CorpFlats Próprio (Controle de Estoque - Sem Repasse)"
          : "Anserve (Repasse a Custo)",
        c.unitsConsumed,
        "0,00",
        "0,00",
        Number(c.reimbursementUnitCost || 0).toFixed(2).replace(".", ","),
        Number(c.totalReimbursementToAnserve || 0).toFixed(2).replace(".", ",")
      ])
    ];
    downloadCsvFile(`frigobar_produtos_vendidos_${extratoStartDate}_a_${extratoEndDate}.csv`, headers, rows);
  };

  const visibleStaff = useMemo(() => {
    if (isCorpFlatsAdmin) return staffList;
    return staffList.filter(s => s.role !== "anserve_gestor");
  }, [staffList, isCorpFlatsAdmin]);

  const handleExportProductivityCsv = () => {
    if (visibleStaff.length === 0) {
      toast({
        title: "Sem dados de equipe",
        description: "Nenhuma colaboradora listada para exportação.",
        variant: "destructive"
      });
      return;
    }
    const headers = [
      "Colaborador",
      "Login",
      "Função",
      "Status",
      "WhatsApp",
      "PIN Mobile",
      "Total de Passagens",
      "Flats Atendidos",
      "Passagens Conformes",
      "Passagens c/ Consumo",
      "Ajustes Internos",
      "NQ (Não Quis)",
      "NP (Não Perturbe)",
      "Unidades Pagas Lançadas/Repostas",
      "Cortesias Repostas",
      "Total Itens Repostos",
      "Última Passagem"
    ];
    const rows = visibleStaff.map((st: any) => {
      const p = st.productivity;
      return [
        st.name,
        `@${st.username}`,
        st.role === "anserve_gestor"
          ? "Gestor Anserve"
          : st.role === "anserve_faturamento"
          ? "Emissão de NF"
          : "Repositora",
        st.active !== false ? "Ativa" : "Inativa",
        st.whatsapp || "-",
        st.pin || "Padrão",
        p?.inspectionsCount || 0,
        p?.flatsVisitedCount || 0,
        p?.conformeCount || 0,
        p?.discrepancyCount || 0,
        p?.internalAdjustmentCount || 0,
        p?.nqCount || 0,
        p?.npCount || 0,
        p?.paidItemsRestockedQty || 0,
        p?.courtesyItemsRestockedQty || 0,
        p?.totalItemsRestockedQty || 0,
        p?.lastInspectionAt ? new Date(p.lastInspectionAt).toLocaleString("pt-BR") : "Sem registro"
      ];
    });
    downloadCsvFile(`frigobar_produtividade_equipe_${extratoStartDate}_a_${extratoEndDate}.csv`, headers, rows);
    toast({
      title: "Produtividade exportada! 📋",
      description: "Planilha CSV de desempenho da equipe baixada com sucesso."
    });
  };

  const filteredReportOrders = useMemo(() => {
    const list = reportsData?.salesSummary?.orders || [];
    if (!salesSearch.trim()) return list;
    const q = salesSearch.toLowerCase().trim();
    return list.filter(
      (o: any) =>
        String(o.id).toLowerCase().includes(q) ||
        String(o.flatNumber).toLowerCase().includes(q) ||
        String(o.guestName || "").toLowerCase().includes(q) ||
        String(o.reservationCode || "").toLowerCase().includes(q) ||
        String(o.itemsSummary || "").toLowerCase().includes(q)
    );
  }, [reportsData, salesSearch]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      if (selectedCategory !== "todas" && p.category !== selectedCategory) return false;
      if (productSearch.trim()) {
        const q = productSearch.toLowerCase().trim();
        return p.name.toLowerCase().includes(q) || (p.description && p.description.toLowerCase().includes(q));
      }
      return true;
    });
  }, [products, selectedCategory, productSearch]);

  const filteredStaff = useMemo(() => {
    return visibleStaff.filter(s => {
      if (staffRoleFilter !== "todos" && s.role !== staffRoleFilter) return false;
      return true;
    });
  }, [visibleStaff, staffRoleFilter]);

  return (
    <Shell>
      <div className="w-full max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-3 sm:py-4 md:py-6 space-y-4 sm:space-y-5 pb-28 min-w-0 overflow-x-hidden">
        <MinibarEcosystemNav currentScreen="gestao" pendingInvoicesCount={pendingInvoicesCount} />

        {/* Header Unificado */}
        <div className="w-full min-w-0 bg-card border border-border p-4 sm:p-6 rounded-3xl shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-xl md:text-2xl font-black text-foreground leading-tight break-words">
                  Gestão de Frigobar
                </h1>
                <Badge className="bg-primary/15 text-primary border-primary/30 text-[10px] font-bold">
                  {isCorpFlatsAdmin ? "Central Unificada • CorpFlats & Anserve" : "Operação Anserve"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {isCorpFlatsAdmin
                  ? "Vendas e repasse, cobranças com estatísticas de inadimplência, passagens nos flats, cardápio, equipe e insights 360° em um único painel."
                  : "Acompanhe vendas e repasse líquido, cobranças e inadimplência, histórico de passagens nos flats e equipe de reposição."}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto shrink-0">
            <div className="flex items-center justify-between sm:justify-start gap-1.5 bg-muted/40 border border-border rounded-xl px-2.5 py-1.5 w-full sm:w-auto min-w-0">
              <Calendar className="w-3.5 h-3.5 text-primary shrink-0" />
              <input
                type="date"
                aria-label="Data inicial do período"
                value={extratoStartDate}
                onChange={e => setExtratoStartDate(e.target.value)}
                className="bg-transparent text-[11px] sm:text-xs font-mono outline-none min-w-0 flex-1 sm:flex-initial"
              />
              <span className="text-[11px] text-muted-foreground shrink-0">até</span>
              <input
                type="date"
                aria-label="Data final do período"
                value={extratoEndDate}
                onChange={e => setExtratoEndDate(e.target.value)}
                className="bg-transparent text-[11px] sm:text-xs font-mono outline-none min-w-0 flex-1 sm:flex-initial"
              />
            </div>

            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => setLocation("/frigobar-notas")}
              className="rounded-xl text-xs font-bold h-9 w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <FileText className="w-3.5 h-3.5 mr-1.5" />
              <span>Notas Fiscais</span>
              {pendingInvoicesCount > 0 && (
                <span className="ml-1.5 bg-amber-400 text-slate-950 text-[10px] font-black px-1.5 py-0.2 rounded-full">
                  {pendingInvoicesCount}
                </span>
              )}
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={loadAll}
              disabled={refreshing}
              className="rounded-xl text-xs font-bold h-9 w-full sm:w-auto"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </div>

        {/* Alerta de Falha de Entrega de NF (Aparece apenas quando há falha pendente) */}
        {deliveryMonitor &&
          ((deliveryMonitor.failedInvoices?.length || 0) > 0 ||
            (deliveryMonitor.retryingInvoices?.length || 0) > 0) && (
            <Card className="rounded-3xl border border-rose-500/50 bg-rose-500/5 p-4 sm:p-5 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                  <div>
                    <h4 className="text-xs sm:text-sm font-black text-foreground">
                      Alerta de Entrega de Nota Fiscal (Monitoramento WhatsApp + E-mail)
                    </h4>
                    <p className="text-[11px] text-muted-foreground">
                      Identificamos falha no envio automático de NF. Corrija o telefone/e-mail do hóspede ou clique em Reenviar.
                    </p>
                  </div>
                </div>
                <Badge className="bg-rose-500/15 text-rose-700 border-rose-500/30 font-bold text-xs w-fit">
                  ⚠️ {(deliveryMonitor.failedInvoices?.length || 0) + (deliveryMonitor.retryingInvoices?.length || 0)}{" "}
                  pendente(s) de reenvio
                </Badge>
              </div>

              <div className="space-y-2 pt-1">
                {[...(deliveryMonitor.failedInvoices || []), ...(deliveryMonitor.retryingInvoices || [])].map(
                  (item: any) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-2xl bg-card border border-rose-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-primary">{item.id}</span>
                          <Badge variant="outline" className="text-[10px] font-bold">
                            Flat {item.flatNumber}
                          </Badge>
                          <strong className="text-foreground">{item.guestName}</strong>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-[11px]">
                          <span
                            className={
                              item.deliveryMonitor?.whatsapp?.status === "sent"
                                ? "text-emerald-600 font-semibold"
                                : "text-rose-600 font-bold"
                            }
                          >
                            📱 WhatsApp ({item.guestPhone || "s/ tel"}):{" "}
                            {item.deliveryMonitor?.whatsapp?.status === "sent"
                              ? "Enviado ✓"
                              : `Falha (${item.deliveryMonitor?.whatsapp?.lastError || "Pendente"})`}
                          </span>
                          <span
                            className={
                              item.deliveryMonitor?.email?.status === "sent"
                                ? "text-emerald-600 font-semibold"
                                : "text-rose-600 font-bold"
                            }
                          >
                            ✉️ E-mail ({item.guestEmail || "s/ email"}):{" "}
                            {item.deliveryMonitor?.email?.status === "sent"
                              ? "Enviado ✓"
                              : `Falha (${item.deliveryMonitor?.email?.lastError || "Pendente"})`}
                          </span>
                        </div>
                      </div>

                      <Button
                        size="sm"
                        onClick={() => handleOpenRetryModal(item)}
                        className="rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white h-8 shrink-0"
                      >
                        <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                        Corrigir Contato / Reenviar NF
                      </Button>
                    </div>
                  )
                )}
              </div>
            </Card>
          )}

        {/* Abas Unificadas em Ordem de Prioridade Operacional */}
        <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="w-full min-w-0 space-y-4">
          <TabsList
            aria-label="Seções da gestão de frigobar"
            className="w-full bg-muted/50 p-1.5 rounded-2xl border border-border flex items-center flex-nowrap overflow-x-auto snap-x snap-proximity h-auto gap-1.5"
          >
            <TabsTrigger
              value="vendas"
              className="rounded-xl text-xs font-bold px-3 py-2.5 flex items-center justify-center gap-2 shrink-0 xl:flex-1 snap-start relative data-[state=active]:after:content-[''] data-[state=active]:after:absolute data-[state=active]:after:inset-x-3 data-[state=active]:after:bottom-0 data-[state=active]:after:border-b-2 data-[state=active]:after:border-primary"
            >
              <DollarSign className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Vendas & Repasse</span>
            </TabsTrigger>

            <TabsTrigger
              value="cobrancas"
              className="rounded-xl text-xs font-bold px-3 py-2.5 flex items-center justify-center gap-2 shrink-0 xl:flex-1 snap-start relative data-[state=active]:after:content-[''] data-[state=active]:after:absolute data-[state=active]:after:inset-x-3 data-[state=active]:after:bottom-0 data-[state=active]:after:border-b-2 data-[state=active]:after:border-primary"
            >
              <Bell className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Cobranças & Inadimplência</span>
              {collectionsPendingCount > 0 && (
                <Badge className="bg-amber-500 text-slate-950 text-[10px] font-black py-0 px-1.5 shrink-0">
                  {collectionsPendingCount}
                </Badge>
              )}
              {collectionsSuspiciousCount > 0 && (
                <Badge
                  className="bg-rose-600 text-white text-[10px] font-black py-0 px-1.5 shrink-0"
                  title="Pedidos pagos sem E2E real do Banco Central"
                >
                  !{collectionsSuspiciousCount}
                </Badge>
              )}
            </TabsTrigger>

            <TabsTrigger
              value="passagens"
              className="rounded-xl text-xs font-bold px-3 py-2.5 flex items-center justify-center gap-2 shrink-0 xl:flex-1 snap-start relative data-[state=active]:after:content-[''] data-[state=active]:after:absolute data-[state=active]:after:inset-x-3 data-[state=active]:after:bottom-0 data-[state=active]:after:border-b-2 data-[state=active]:after:border-primary"
            >
              <ClipboardList className="w-4 h-4 text-sky-600 shrink-0" />
              <span>Passagens nos Flats</span>
            </TabsTrigger>

            {isCorpFlatsAdmin && (
              <TabsTrigger
                value="catalogo"
                className="rounded-xl text-xs font-bold px-3 py-2.5 flex items-center justify-center gap-2 shrink-0 xl:flex-1 snap-start relative data-[state=active]:after:content-[''] data-[state=active]:after:absolute data-[state=active]:after:inset-x-3 data-[state=active]:after:bottom-0 data-[state=active]:after:border-b-2 data-[state=active]:after:border-primary"
              >
                <Package className="w-4 h-4 text-primary shrink-0" />
                <span>Cardápio & Estoque</span>
              </TabsTrigger>
            )}

            <TabsTrigger
              value="equipe"
              className="rounded-xl text-xs font-bold px-3 py-2.5 flex items-center justify-center gap-2 shrink-0 xl:flex-1 snap-start relative data-[state=active]:after:content-[''] data-[state=active]:after:absolute data-[state=active]:after:inset-x-3 data-[state=active]:after:bottom-0 data-[state=active]:after:border-b-2 data-[state=active]:after:border-primary"
            >
              <Users className="w-4 h-4 text-teal-600 shrink-0" />
              <span>Equipe Anserve</span>
              <Badge variant="secondary" className="text-[10px] py-0 px-1.5 shrink-0">
                {visibleStaff.length}
              </Badge>
            </TabsTrigger>

            {isCorpFlatsAdmin && (
              <TabsTrigger
                value="insights"
                className="rounded-xl text-xs font-bold px-3 py-2.5 flex items-center justify-center gap-2 shrink-0 xl:flex-1 snap-start relative data-[state=active]:after:content-[''] data-[state=active]:after:absolute data-[state=active]:after:inset-x-3 data-[state=active]:after:bottom-0 data-[state=active]:after:border-b-2 data-[state=active]:after:border-primary"
              >
                <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                <span>Insights 360°</span>
              </TabsTrigger>
            )}
          </TabsList>

          {/* ABA 1: VENDAS & REPASSE */}
          <TabsContent value="vendas" className="w-full min-w-0 space-y-5">
            <MinibarSalesTab
              reportsData={reportsData}
              settlement={settlementData}
              peanutStock={peanutStock}
              pendingInvoicesCount={pendingInvoicesCount}
              canManageAdminActions={isCorpFlatsAdmin}
              sohoFlats={SOHO_FLATS}
              salesSearch={salesSearch}
              onSalesSearchChange={setSalesSearch}
              salesFlatFilter={salesFlatFilter}
              onSalesFlatFilterChange={setSalesFlatFilter}
              salesStatusFilter={salesStatusFilter}
              onSalesStatusFilterChange={setSalesStatusFilter}
              filteredReportOrders={filteredReportOrders}
              onNavigateInvoices={() => setLocation("/frigobar-notas")}
              onOpenPeanutStock={
                isCorpFlatsAdmin
                  ? () => {
                      setActiveTab("catalogo");
                      setCatalogSubView("estoque_amendoim");
                    }
                  : undefined
              }
              onExportProductsCsv={handleExportProductsCsv}
              onExportSalesCsv={handleExportSalesCsv}
              onReopenSalesOrder={(o) => {
                setReopenSalesOrder(o);
                setReopenSalesReason(
                  o.paymentVerificationStatus === "unverified_synthetic_e2e"
                    ? "Pedido sem E2E real do Banco Central — reaberto para cobrança."
                    : ""
                );
                setReopenSalesError(null);
              }}
              onDeleteOrder={handleDeleteMinibarOrder}
            />
          </TabsContent>

          {/* ABA 2: COBRANÇAS & INADIMPLÊNCIA */}
          <TabsContent value="cobrancas" className="w-full min-w-0 space-y-5">
            <MinibarCollectionsPanel
              canConfigureRules={isCorpFlatsAdmin}
              onDataChanged={loadAll}
              onOverviewLoaded={(s) => {
                setCollectionsPendingCount(Number(s.pendingTargetsCount || 0));
                setCollectionsSuspiciousCount(Number(s.suspiciousPaidOrdersCount || 0));
              }}
            />
          </TabsContent>

          {/* ABA 3: PASSAGENS NOS FLATS */}
          <TabsContent value="passagens" className="w-full min-w-0 space-y-5">
            <MinibarInspectionsTab reportsData={reportsData} />
          </TabsContent>

          {/* ABA 6: INSIGHTS 360° (EXCLUSIVO ADMIN/DEV CORPFLATS) */}
          {isCorpFlatsAdmin && (
          <TabsContent value="insights" className="w-full min-w-0 space-y-5">
            {/* Banner + Sub-filtros de Visualização */}
            <div className="w-full min-w-0 bg-gradient-to-r from-indigo-950/90 via-slate-900 to-teal-950/90 text-white p-4 sm:p-5 rounded-3xl border border-indigo-500/30 space-y-4 shadow-md">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-amber-400 text-slate-950 font-black text-[10px] shrink-0">
                      🔒 EXCLUSIVO DIRETORIA CORPFLATS
                    </Badge>
                    <span className="text-[11px] text-indigo-200 font-semibold">
                      Visão analítica 360° (oculta para a Anserve)
                    </span>
                  </div>
                  <h2 className="text-base sm:text-lg font-black leading-snug">
                    Inteligência de Consumo, Rentabilidade e Perfil do Hóspede
                  </h2>
                </div>

                <div className="flex flex-wrap gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleExportProductMatrixCsv}
                    className="rounded-xl text-xs font-bold h-8 gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    CSV Curva ABC
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleExportFlatsRankingCsv}
                    className="rounded-xl text-xs font-bold h-8 gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    CSV Flats
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleExportDemographicsCsv}
                    className="rounded-xl text-xs font-bold h-8 gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    CSV Estados
                  </Button>
                </div>
              </div>

              {/* Sub-Abas de Insights para não empilhar tudo numa página gigante */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-white/10">
                {[
                  {
                    id: "visao_geral" as const,
                    label: "✨ Visão Geral & Temporalidade",
                    desc: "KPIs executivos, descobertas, dias e horários"
                  },
                  {
                    id: "produtos_flats" as const,
                    label: "🏆 Ranking de Produtos & Flats",
                    desc: "Curva ABC, margem de lucro, combos e ranking das 19 UHs"
                  },
                  {
                    id: "perfil_hospedes" as const,
                    label: "🌎 Perfil dos Hóspedes & Fiscal",
                    desc: "Estados (UF), cidades, canal OTA e preferência de NF"
                  }
                ].map((sub) => {
                  const active = insightsSubView === sub.id;
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => setInsightsSubView(sub.id)}
                      className={`p-3 rounded-2xl text-left border transition-all ${
                        active
                          ? "bg-white text-slate-950 border-white shadow-md"
                          : "bg-slate-900/70 text-slate-200 border-white/15 hover:bg-slate-800/80"
                      }`}
                    >
                      <span className="text-xs font-black block">{sub.label}</span>
                      <span className={`text-[10px] block mt-0.5 ${active ? "text-slate-600" : "text-slate-400"}`}>
                        {sub.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 6 Executive KPIs (Sempre visíveis no topo da aba Insights) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
              <Card className="rounded-2xl border border-border bg-card p-4 space-y-1">
                <span className="text-[11px] text-muted-foreground font-semibold">Receita Bruta Paga</span>
                <div className="text-lg font-black text-foreground">
                  R$ {Number(insightsData?.kpis?.totalRevenue || 0).toFixed(2)}
                </div>
                <span className="text-[10px] text-muted-foreground block">
                  {insightsData?.kpis?.totalOrders || 0} pedidos pagos
                </span>
              </Card>

              <Card className="rounded-2xl border border-border bg-card p-4 space-y-1">
                <span className="text-[11px] text-muted-foreground font-semibold">Margem / Spread Bruto</span>
                <div className="text-lg font-black text-emerald-600">
                  R$ {Number(insightsData?.kpis?.netProfit || 0).toFixed(2)}
                </div>
                <span className="text-[10px] text-emerald-600 font-bold block">
                  {insightsData?.kpis?.profitMarginPct || 0}% sobre venda
                </span>
              </Card>

              <Card className="rounded-2xl border border-border bg-card p-4 space-y-1">
                <span className="text-[11px] text-muted-foreground font-semibold">Ticket Médio</span>
                <div className="text-lg font-black text-indigo-600">
                  R$ {Number(insightsData?.kpis?.averageTicket || 0).toFixed(2)}
                </div>
                <span className="text-[10px] text-muted-foreground block">
                  {insightsData?.kpis?.totalUnitsSold || 0} unidades vendidas
                </span>
              </Card>

              <Card className="rounded-2xl border border-border bg-card p-4 space-y-1">
                <span className="text-[11px] text-muted-foreground font-semibold">Investimento Cortesias</span>
                <div className="text-lg font-black text-sky-600">
                  R$ {Number(insightsData?.kpis?.courtesyCostTotal || 0).toFixed(2)}
                </div>
                <span className="text-[10px] text-muted-foreground block">
                  {insightsData?.kpis?.courtesyUnitsTotal || 0} cortesias entregues
                </span>
              </Card>
            </div>

            {/* SUB-VISÃO 1: VISÃO GERAL, DESCOBERTAS & TEMPORALIDADE */}
            {insightsSubView === "visao_geral" && (
              <div className="space-y-5">
                {Array.isArray(insightsData?.curiosities) && insightsData.curiosities.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-500" />
                      <h3 className="text-sm font-black text-foreground">
                        Descobertas & Curiosidades Inteligentes do Seu Público
                      </h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                      {insightsData.curiosities.map((c: any) => (
                        <Card
                          key={c.id}
                          className="rounded-3xl border border-border bg-card p-4 space-y-2 shadow-xs hover:border-primary/40 transition-all"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                              <span className="text-base">{c.icon}</span>
                              {c.category}
                            </span>
                            <Badge variant="secondary" className="text-[10px] font-bold">
                              {c.metricBadge}
                            </Badge>
                          </div>
                          <h4 className="text-xs font-black text-foreground leading-snug">{c.title}</h4>
                          <p className="text-[11px] text-muted-foreground leading-relaxed">{c.description}</p>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 w-full min-w-0">
                  <Card className="rounded-3xl border border-border p-4 space-y-3 w-full min-w-0">
                    <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span>Consumo por Dia da Semana</span>
                    </h3>
                    <div className="space-y-2">
                      {(insightsData?.temporal?.byDayOfWeek || []).map((d: any) => (
                        <div
                          key={d.day}
                          className="flex items-center justify-between p-2 rounded-xl bg-muted/30 border border-border/60 text-xs"
                        >
                          <div>
                            <strong className="text-foreground">{d.day}</strong>
                            <span className="text-[10px] text-muted-foreground block">
                              Top: {d.topCategory}
                            </span>
                          </div>
                          <div className="text-right font-mono">
                            <strong className="text-emerald-600 block">R$ {Number(d.revenue).toFixed(2)}</strong>
                            <span className="text-[10px] text-muted-foreground">{d.units} un.</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>

                  <Card className="rounded-3xl border border-border p-4 space-y-3 w-full min-w-0">
                    <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span>Faixa de Horário dos Pagamentos/Lançamentos</span>
                    </h3>
                    <div className="space-y-2.5">
                      {(insightsData?.temporal?.byHourSlot || []).map((h: any) => (
                        <div
                          key={h.id}
                          className="p-3 rounded-2xl bg-muted/30 border border-border/60 flex items-center justify-between text-xs"
                        >
                          <div>
                            <strong className="text-foreground block">{h.label}</strong>
                            <span className="text-[10px] text-muted-foreground">
                              Preferência: {h.topCategory}
                            </span>
                          </div>
                          <div className="text-right font-mono">
                            <strong className="text-foreground block">R$ {Number(h.revenue).toFixed(2)}</strong>
                            <span className="text-[10px] text-muted-foreground">{h.ordersCount} pedidos</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>

                  <Card className="rounded-3xl border border-border p-4 space-y-3 w-full min-w-0">
                    <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                      <span>Duração da Estadia & Ocupação</span>
                    </h3>
                    <div className="space-y-2">
                      {(insightsData?.stayProfile?.byStayLength || []).map((b: any) => (
                        <div
                          key={b.id}
                          className="p-2.5 rounded-xl bg-muted/30 border border-border/60 flex items-center justify-between text-xs"
                        >
                          <div>
                            <strong className="text-foreground block">{b.label}</strong>
                            <span className="text-[10px] text-muted-foreground">
                              Ticket: R$ {Number(b.averageTicket).toFixed(2)} • Top: {b.topCategory}
                            </span>
                          </div>
                          <strong className="font-mono text-emerald-600">R$ {Number(b.revenue).toFixed(2)}</strong>
                        </div>
                      ))}
                      <div className="border-t border-border pt-2 space-y-2">
                        {(insightsData?.stayProfile?.byGuestCount || []).map((g: any) => (
                          <div
                            key={g.id}
                            className="p-2.5 rounded-xl bg-primary/5 border border-primary/20 flex items-center justify-between text-xs"
                          >
                            <div>
                              <strong className="text-foreground block">{g.label}</strong>
                              <span className="text-[10px] text-muted-foreground">
                                Ticket: R$ {Number(g.averageTicket).toFixed(2)}
                              </span>
                            </div>
                            <strong className="font-mono text-primary">R$ {Number(g.revenue).toFixed(2)}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
            )}

            {/* SUB-VISÃO 2: RANKING DE PRODUTOS (CURVA ABC), COMBOS & FLATS */}
            {insightsSubView === "produtos_flats" && (
              <div className="space-y-5">
                <Card className="rounded-3xl border border-border overflow-hidden w-full min-w-0">
                  <CardHeader className="p-4 border-b border-border bg-card flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-black flex items-center gap-2">
                        <ShoppingBag className="w-4 h-4 text-primary shrink-0" />
                        <span>Matriz Curva ABC, Margem de Lucro & Diagnóstico de Giro do Cardápio</span>
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Identifique os produtos campeões (Classe A), os de maior margem e os itens com baixo giro
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <div className="w-full overflow-x-auto">
                    <table className="w-full min-w-[680px] text-xs text-left">
                      <thead className="bg-muted/40 text-muted-foreground font-bold border-b border-border">
                        <tr>
                          <th className="p-3">Curva</th>
                          <th className="p-3">Produto</th>
                          <th className="p-3">Categoria</th>
                          <th className="p-3 text-center">Saídas</th>
                          <th className="p-3 text-right">Receita Bruta</th>
                          <th className="p-3 text-right">Custo Anserve</th>
                          <th className="p-3 text-right">Margem Bruta</th>
                          <th className="p-3">Diagnóstico</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {(insightsData?.productMatrix || []).map((p: any) => (
                          <tr key={p.productId} className="hover:bg-muted/20">
                            <td className="p-3">
                              <Badge
                                className={
                                  p.abcClass === "A"
                                    ? "bg-emerald-500 text-white font-black text-[10px]"
                                    : p.abcClass === "B"
                                    ? "bg-sky-500 text-white font-black text-[10px]"
                                    : "bg-slate-400 text-white font-black text-[10px]"
                                }
                              >
                                Classe {p.abcClass}
                              </Badge>
                            </td>
                            <td className="p-3 font-bold text-foreground">{p.name}</td>
                            <td className="p-3 text-muted-foreground">{p.category}</td>
                            <td className="p-3 text-center font-mono font-bold">{p.unitsSold} un.</td>
                            <td className="p-3 text-right font-mono font-bold">
                              R$ {Number(p.revenue).toFixed(2)} ({p.shareOfRevenuePct}%)
                            </td>
                            <td className="p-3 text-right font-mono text-muted-foreground">
                              R$ {Number(p.totalCost).toFixed(2)}
                            </td>
                            <td className="p-3 text-right font-mono font-black text-emerald-600">
                              R$ {Number(p.netProfit).toFixed(2)} ({p.marginPct}%)
                            </td>
                            <td className="p-3">
                              <Badge
                                variant="outline"
                                className={
                                  p.unitsSold === 0
                                    ? "border-rose-500/40 text-rose-600 text-[10px]"
                                    : p.abcClass === "A"
                                    ? "border-emerald-500/40 text-emerald-600 text-[10px]"
                                    : "text-[10px]"
                                }
                              >
                                {p.statusTag}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>

                {Array.isArray(insightsData?.marketBasketPairs) && insightsData.marketBasketPairs.length > 0 && (
                  <Card className="rounded-3xl border border-border p-4 space-y-3 w-full min-w-0">
                    <div>
                      <h3 className="text-sm font-black text-foreground">
                        🤝 Cesta de Compras — Produtos Mais Consumidos Juntos na Mesma Estadia
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Combinações mais frequentes registradas nos flats
                      </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                      {insightsData.marketBasketPairs.map((pair: any) => (
                        <div
                          key={pair.pair}
                          className="p-3.5 rounded-2xl bg-muted/30 border border-border space-y-1.5 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <Badge className="bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30 text-[10px] font-bold">
                              {pair.coOccurrences}x juntos ({pair.shareOfOrdersPct}%)
                            </Badge>
                          </div>
                          <div className="font-black text-foreground">{pair.pair}</div>
                          <p className="text-[10px] text-muted-foreground">{pair.suggestion}</p>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                <Card className="rounded-3xl border border-border overflow-hidden w-full min-w-0">
                  <CardHeader className="p-4 border-b border-border bg-card">
                    <CardTitle className="text-sm font-black flex items-center gap-2">
                      <Award className="w-4 h-4 text-amber-500 shrink-0" />
                      <span>Ranking de Performance de Frigobar por Flat (19 UHs)</span>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Faturamento, volume vendido, custo de cortesias e produto mais consumido em cada flat
                    </CardDescription>
                  </CardHeader>
                  <div className="w-full overflow-x-auto max-h-96">
                    <table className="w-full min-w-[580px] text-xs text-left">
                      <thead className="bg-muted/40 text-muted-foreground font-bold border-b border-border sticky top-0">
                        <tr>
                          <th className="p-3">Flat</th>
                          <th className="p-3 text-center">Pedidos</th>
                          <th className="p-3 text-center">Unidades</th>
                          <th className="p-3">Produto Campeão</th>
                          <th className="p-3 text-right">Custo Cortesias</th>
                          <th className="p-3 text-right">Receita Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {(insightsData?.byFlat || []).map((f: any) => (
                          <tr key={f.flatNumber} className="hover:bg-muted/20">
                            <td className="p-3 font-black text-foreground">Flat {f.flatNumber}</td>
                            <td className="p-3 text-center font-mono">{f.ordersCount}</td>
                            <td className="p-3 text-center font-mono">{f.unitsSold} un.</td>
                            <td className="p-3 font-semibold text-primary">{f.topProduct}</td>
                            <td className="p-3 text-right font-mono text-sky-600">
                              R$ {Number(f.courtesyCost).toFixed(2)}
                            </td>
                            <td className="p-3 text-right font-mono font-black text-emerald-600">
                              R$ {Number(f.revenue).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            )}

            {/* SUB-VISÃO 3: PERFIL DOS HÓSPEDES (UF / CIDADES / CANAL OTA) & PREFERÊNCIA FISCAL */}
            {insightsSubView === "perfil_hospedes" && (
              <div className="space-y-5">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 w-full min-w-0">
                  <Card className="rounded-3xl border border-border overflow-hidden w-full min-w-0">
                    <CardHeader className="p-4 border-b border-border bg-card">
                      <CardTitle className="text-sm font-black flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-indigo-600 shrink-0" />
                        <span>Consumo por Estado de Origem (UF)</span>
                      </CardTitle>
                      <CardDescription className="text-xs">
                        O que cada estado mais consome e qual o ticket médio regional
                      </CardDescription>
                    </CardHeader>
                    <div className="w-full overflow-x-auto">
                      <table className="w-full min-w-[520px] text-xs text-left">
                        <thead className="bg-muted/40 text-muted-foreground font-bold border-b border-border">
                          <tr>
                            <th className="p-3">UF</th>
                            <th className="p-3 text-center">Pedidos</th>
                            <th className="p-3">Categoria Nº 1</th>
                            <th className="p-3">Produto Favorito</th>
                            <th className="p-3 text-right">Ticket Médio</th>
                            <th className="p-3 text-right">Receita</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {(insightsData?.byState || []).length === 0 ? (
                            <tr>
                              <td colSpan={6} className="p-6 text-center text-muted-foreground">
                                Sem dados demográficos no período.
                              </td>
                            </tr>
                          ) : (
                            (insightsData?.byState || []).map((st: any) => (
                              <tr key={st.state} className="hover:bg-muted/20">
                                <td className="p-3 font-black text-indigo-600">{st.state}</td>
                                <td className="p-3 text-center font-mono">{st.ordersCount}</td>
                                <td className="p-3">
                                  <Badge variant="outline" className="text-[10px] font-bold">
                                    {st.topCategory}
                                  </Badge>
                                </td>
                                <td className="p-3 font-semibold text-foreground">{st.topProduct}</td>
                                <td className="p-3 text-right font-mono">R$ {Number(st.averageTicket).toFixed(2)}</td>
                                <td className="p-3 text-right font-mono font-black text-emerald-600">
                                  R$ {Number(st.revenue).toFixed(2)} ({st.sharePct}%)
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </Card>

                  <Card className="rounded-3xl border border-border overflow-hidden w-full min-w-0">
                    <CardHeader className="p-4 border-b border-border bg-card">
                      <CardTitle className="text-sm font-black flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-sky-600 shrink-0" />
                        <span>Top Cidades Emissoras de Hóspedes</span>
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Preferência de produto por município de residência do hóspede
                      </CardDescription>
                    </CardHeader>
                    <div className="w-full overflow-x-auto">
                      <table className="w-full min-w-[440px] text-xs text-left">
                        <thead className="bg-muted/40 text-muted-foreground font-bold border-b border-border">
                          <tr>
                            <th className="p-3">Cidade (UF)</th>
                            <th className="p-3 text-center">Unidades</th>
                            <th className="p-3">Item Mais Consumido</th>
                            <th className="p-3 text-right">Total Gasto</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {(insightsData?.byCity || []).length === 0 ? (
                            <tr>
                              <td colSpan={4} className="p-6 text-center text-muted-foreground">
                                Sem dados de cidades no período.
                              </td>
                            </tr>
                          ) : (
                            (insightsData?.byCity || []).map((c: any) => (
                              <tr key={c.cityLabel} className="hover:bg-muted/20">
                                <td className="p-3 font-bold text-foreground">{c.cityLabel}</td>
                                <td className="p-3 text-center font-mono">{c.units} un.</td>
                                <td className="p-3 text-muted-foreground font-semibold">{c.topProduct}</td>
                                <td className="p-3 text-right font-mono font-black text-emerald-600">
                                  R$ {Number(c.revenue).toFixed(2)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 w-full min-w-0">
                  <Card className="rounded-3xl border border-border overflow-hidden w-full min-w-0">
                    <CardHeader className="p-4 border-b border-border bg-card">
                      <CardTitle className="text-sm font-black flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Consumo por Canal da Reserva (Direto vs. Booking vs. Airbnb)</span>
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Qual canal traz o hóspede que mais consome frigobar
                      </CardDescription>
                    </CardHeader>
                    <div className="w-full overflow-x-auto">
                      <table className="w-full min-w-[460px] text-xs text-left">
                        <thead className="bg-muted/40 text-muted-foreground font-bold border-b border-border">
                          <tr>
                            <th className="p-3">Canal de Origem</th>
                            <th className="p-3 text-center">Pedidos</th>
                            <th className="p-3">Categoria Líder</th>
                            <th className="p-3 text-right">Ticket Médio</th>
                            <th className="p-3 text-right">Receita</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {(insightsData?.byChannel || []).map((ch: any) => (
                            <tr key={ch.channel} className="hover:bg-muted/20">
                              <td className="p-3 font-bold text-foreground">{ch.channel}</td>
                              <td className="p-3 text-center font-mono">{ch.ordersCount}</td>
                              <td className="p-3">{ch.topCategory}</td>
                              <td className="p-3 text-right font-mono">R$ {Number(ch.averageTicket).toFixed(2)}</td>
                              <td className="p-3 text-right font-mono font-black text-emerald-600">
                                R$ {Number(ch.revenue).toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>

                  <Card className="rounded-3xl border border-border p-4 space-y-4 w-full min-w-0">
                    <div>
                      <h3 className="text-sm font-black text-foreground flex items-center gap-2">
                        <Briefcase className="w-4 h-4 text-sky-600 shrink-0" />
                        <span>Raio-X de Reembolso Corporativo & Preferência Fiscal</span>
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Como os hóspedes pedem a descrição na Nota Fiscal e o que realmente consomem em cada opção
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {["water", "minibar_consumption", "detailed"].map(key => {
                        const item = insightsData?.corporateVsLeisure?.fiscalPreferences?.[key];
                        return (
                          <div key={key} className="p-3.5 rounded-2xl bg-muted/40 border border-border space-y-1">
                            <span className="text-[10px] font-bold text-muted-foreground block">
                              {item?.label || key}
                            </span>
                            <div className="text-base font-black text-foreground">
                              R$ {Number(item?.revenue || 0).toFixed(2)}
                            </div>
                            <span className="text-[11px] font-semibold text-primary block">
                              {item?.count || 0} pedidos
                            </span>
                            <span className="text-[10px] text-muted-foreground block pt-1 border-t border-border/60">
                              Mais consumido real: <strong className="text-foreground">{item?.topRealProduct || "N/A"}</strong>
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div className="p-3 rounded-2xl bg-card border border-border flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-[10px] text-muted-foreground block">Nota em CPF (Pessoa Física)</span>
                          <strong className="text-sm font-black">
                            {insightsData?.corporateVsLeisure?.documentTypes?.cpf?.count || 0} pedidos
                          </strong>
                        </div>
                        <span className="font-mono text-xs font-bold text-emerald-600 shrink-0">
                          R$ {Number(insightsData?.corporateVsLeisure?.documentTypes?.cpf?.revenue || 0).toFixed(2)}
                        </span>
                      </div>

                      <div className="p-3 rounded-2xl bg-card border border-border flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-[10px] text-muted-foreground block">Nota em CNPJ (Empresa)</span>
                          <strong className="text-sm font-black">
                            {insightsData?.corporateVsLeisure?.documentTypes?.cnpj?.count || 0} pedidos
                          </strong>
                        </div>
                        <span className="font-mono text-xs font-bold text-sky-600 shrink-0">
                          R$ {Number(insightsData?.corporateVsLeisure?.documentTypes?.cnpj?.revenue || 0).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
            )}
          </TabsContent>
          )}

          {/* ABA 4: CARDÁPIO & ESTOQUE PADRÃO (EXCLUSIVO ADMIN/DEV CORPFLATS) */}
          {isCorpFlatsAdmin && (
          <TabsContent value="catalogo" className="w-full min-w-0 space-y-5">
            {/* Seletor de Sub-visão: 3 sub-abas limpas (Produtos, Gabarito, Estoque Amendoim) */}
            <div className="bg-card border border-border p-3 sm:p-4 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCatalogSubView("produtos")}
                  className={`px-4 py-2 rounded-2xl text-xs font-black transition-all flex items-center gap-2 ${
                    catalogSubView === "produtos"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Package className="w-4 h-4" />
                  <span>Produtos, Preços & Cortesias ({products.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCatalogSubView("gabarito")}
                  className={`px-4 py-2 rounded-2xl text-xs font-black transition-all flex items-center gap-2 ${
                    catalogSubView === "gabarito"
                      ? "bg-sky-600 text-white shadow-sm"
                      : "bg-muted/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Sliders className="w-4 h-4" />
                  <span>Quantidade Padrão por Flat (Gabarito)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCatalogSubView("estoque_amendoim")}
                  className={`px-4 py-2 rounded-2xl text-xs font-black transition-all flex items-center gap-2 ${
                    catalogSubView === "estoque_amendoim"
                      ? "bg-amber-700 text-white shadow-sm"
                      : "bg-muted/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Package className="w-4 h-4" />
                  <span>🥜 Estoque Amendoim (Próprio)</span>
                  <Badge
                    className={`font-black text-[9px] px-1.5 py-0.5 rounded-full ml-0.5 ${
                      peanutStock?.lowStockAlert
                        ? "bg-rose-500 text-white"
                        : "bg-amber-400 text-slate-950"
                    }`}
                  >
                    {peanutStock?.hasStockConfigured ? `${peanutStock.currentBalance} un.` : "Configurar"}
                  </Badge>
                </button>
              </div>

              {catalogSubView === "produtos" && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleOpenProductModal()}
                  className="rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 h-9"
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Novo Produto no Cardápio
                </Button>
              )}
            </div>

            {catalogSubView === "produtos" ? (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      size="sm"
                      variant={selectedCategory === "todas" ? "default" : "outline"}
                      onClick={() => setSelectedCategory("todas")}
                      className="h-8 rounded-xl text-xs font-bold"
                    >
                      Todas as Categorias
                    </Button>
                    {CATEGORIES.map(cat => (
                      <Button
                        key={cat}
                        size="sm"
                        variant={selectedCategory === cat ? "default" : "outline"}
                        onClick={() => setSelectedCategory(cat)}
                        className="h-8 rounded-xl text-xs font-bold"
                      >
                        {cat}
                      </Button>
                    ))}
                  </div>

                  <div className="relative w-full sm:w-64">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Buscar produto..."
                      value={productSearch}
                      onChange={e => setProductSearch(e.target.value)}
                      className="h-8 pl-9 text-xs rounded-xl"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full min-w-0">
                  {filteredProducts.map(p => {
                    const stdQty = stockQuantities[p.id] ?? p.defaultQuantity ?? 0;
                    return (
                      <Card key={p.id} className="rounded-3xl border border-border bg-card p-4 space-y-3 shadow-xs w-full min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            {p.imageUrl ? (
                              <FrigobarPicture
                                src={p.imageUrl}
                                alt={p.name}
                                width={48}
                                height={48}
                                sizes="48px"
                                loading="lazy"
                                className="w-12 h-12 rounded-2xl object-cover shrink-0"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-black text-sm shrink-0">
                                🧊
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <strong className="text-sm font-bold text-foreground break-words">{p.name}</strong>
                                {p.isCourtesy && (
                                  <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 text-[9px] font-bold">
                                    Cortesia Free
                                  </Badge>
                                )}
                              </div>
                              <span className="text-[11px] text-muted-foreground block">
                                {p.category} • Padrão no flat: <strong>{stdQty} un.</strong>
                              </span>
                            </div>
                          </div>

                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleOpenProductModal(p)}
                            className="h-8 w-8 rounded-xl text-muted-foreground hover:text-foreground shrink-0"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>

                        {p.description && <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>}

                        <div className="flex items-center justify-between pt-2 border-t border-border text-xs">
                          <div>
                            <span className="text-[10px] text-muted-foreground block">Venda no Cardápio:</span>
                            <strong className="text-sm font-black text-emerald-600">
                              R$ {Number(p.price).toFixed(2)}
                            </strong>
                          </div>

                          <div className="text-right">
                            {p.id === "prod_amendoim_mendorato" || (p as any).supplierOrigin === "hotel_proprio" ? (
                              <>
                                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold block">
                                  Fornecimento Próprio (Sem Repasse):
                                </span>
                                <span className="text-xs font-mono font-bold text-foreground">
                                  R$ 0,00 Anserve
                                </span>
                                {Number((p as any).ownCost ?? p.cost ?? 0) > 0 && (
                                  <span className="text-[10px] text-muted-foreground block">
                                    Custo interno: R$ {Number((p as any).ownCost ?? p.cost ?? 0).toFixed(2)}
                                  </span>
                                )}
                              </>
                            ) : (
                              <>
                                <span className="text-[10px] text-muted-foreground block">Custo Repasse Anserve:</span>
                                <span className="text-xs font-mono font-semibold text-muted-foreground">
                                  R$ {Number(p.cost || 0).toFixed(2)}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ) : catalogSubView === "gabarito" ? (
              <div className="space-y-4">
                <div className="bg-card border border-border p-4 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full min-w-0">
                  <div className="space-y-0.5 min-w-0">
                    <h3 className="text-sm font-bold text-foreground">Configuração da Quantidade Padrão no Flat (Gabarito)</h3>
                    <p className="text-xs text-muted-foreground">
                      Defina quantas unidades de cada item devem constar no frigobar abastecido (globalmente ou personalizado para um flat específico).
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    <span className="text-xs font-bold text-muted-foreground">Aplicar em:</span>
                    <select
                      value={selectedFlatForStock}
                      onChange={e => handleSelectFlatForStock(e.target.value)}
                      className="h-9 text-xs rounded-xl border border-input bg-background px-3 font-bold flex-1 sm:flex-initial min-w-0"
                    >
                      <option value="global">🌐 Padrão Global (Todos os 19 Flats)</option>
                      {SOHO_FLATS.map(f => (
                        <option key={f} value={f}>
                          Flat {f} (Personalizado)
                        </option>
                      ))}
                    </select>

                    <Button
                      size="sm"
                      onClick={handleSaveDefaultStock}
                      disabled={savingStock}
                      className="rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white h-9 w-full sm:w-auto"
                    >
                      {savingStock ? "Salvando..." : "Salvar Gabarito"}
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 w-full min-w-0">
                  {products.map(prod => {
                    const qty = stockQuantities[prod.id] || 0;
                    return (
                      <div
                        key={prod.id}
                        className="p-3.5 rounded-2xl bg-card border border-border flex items-center justify-between gap-3 shadow-xs w-full min-w-0"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {prod.imageUrl ? (
                            <FrigobarPicture
                              src={prod.imageUrl}
                              alt={prod.name}
                              width={36}
                              height={36}
                              sizes="36px"
                              loading="lazy"
                              className="w-9 h-9 rounded-xl object-cover shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                              🧊
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-bold text-xs text-foreground truncate">{prod.name}</div>
                            <span className="text-[10px] text-muted-foreground block truncate">{prod.category}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            disabled={qty === 0}
                            onClick={() =>
                              setStockQuantities(prev => ({
                                ...prev,
                                [prod.id]: Math.max(0, qty - 1)
                              }))
                            }
                            className="h-7 w-7 rounded-lg"
                          >
                            -
                          </Button>
                          <span className="w-6 text-center font-bold text-xs font-mono">{qty}</span>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            onClick={() =>
                              setStockQuantities(prev => ({
                                ...prev,
                                [prod.id]: qty + 1
                              }))
                            }
                            className="h-7 w-7 rounded-lg"
                          >
                            +
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-5 w-full min-w-0">
                <div className="bg-card border border-border p-4 sm:p-5 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 text-[10px] font-black">
                        🥜 FORNECIMENTO PRÓPRIO CORPFLATS • SEM REPASSE ANSERVE (R$ 0,00)
                      </Badge>
                      {peanutStock?.lowStockAlert && (
                        <Badge className="bg-rose-600 text-white text-[10px] font-black">
                          ⚠️ Estoque Abaixo do Mínimo ({peanutStock.minAlertThreshold} un.)
                        </Badge>
                      )}
                    </div>
                    <h3 className="text-sm sm:text-base font-black text-foreground">
                      Controle de Estoque Próprio — Amendoim Mendorato 27g
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Baixa automática a cada conferência/passagem nos flats. O amendoim não entra no repasse financeiro para a Anserve.
                    </p>
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleExportPeanutStockCsv}
                    className="rounded-xl text-xs font-bold h-9 gap-1.5 shrink-0"
                  >
                    <Download className="w-3.5 h-3.5 text-amber-600" />
                    <span>Exportar Estoque & Saídas (CSV)</span>
                  </Button>
                </div>

                {/* KPIs do Estoque Próprio */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                  <Card
                    className={`rounded-2xl border p-4 space-y-1 ${
                      peanutStock?.lowStockAlert
                        ? "border-rose-500/50 bg-rose-500/5"
                        : "border-border bg-card"
                    }`}
                  >
                    <span className="text-[11px] text-muted-foreground font-semibold">
                      Saldo Disponível CorpFlats
                    </span>
                    <div
                      className={`text-xl font-black ${
                        peanutStock?.lowStockAlert ? "text-rose-600" : "text-foreground"
                      }`}
                    >
                      {peanutStock?.hasStockConfigured
                        ? `${peanutStock.currentBalance} un.`
                        : "Não iniciado"}
                    </div>
                    <span className="text-[10px] text-muted-foreground block">
                      Alerta mínimo: {peanutStock?.minAlertThreshold ?? 30} un.
                    </span>
                  </Card>

                  <Card className="rounded-2xl border border-border bg-card p-4 space-y-1">
                    <span className="text-[11px] text-muted-foreground font-semibold">
                      Saídas no Período Selecionado
                    </span>
                    <div className="text-xl font-black text-amber-600">
                      {peanutStock?.periodTotalOut || 0} un.
                    </div>
                    <span className="text-[10px] text-muted-foreground block">
                      {peanutStock?.periodGuestConsumed || 0} hóspedes •{" "}
                      {peanutStock?.periodInternalConsumed || 0} flats •{" "}
                      {peanutStock?.periodManualOutQty || 0} avulsas
                    </span>
                  </Card>

                  <Card className="rounded-2xl border border-border bg-card p-4 space-y-1">
                    <span className="text-[11px] text-muted-foreground font-semibold">
                      Entradas / Compras no Período
                    </span>
                    <div className="text-xl font-black text-emerald-600">
                      +{peanutStock?.periodEntriesQty || 0} un.
                    </div>
                    <span className="text-[10px] text-muted-foreground block">
                      Total histórico comprado: {peanutStock?.totalEntriesQty || 0} un.
                    </span>
                  </Card>

                  <Card className="rounded-2xl border border-border bg-card p-4 space-y-1">
                    <span className="text-[11px] text-muted-foreground font-semibold">
                      Repasse para Anserve
                    </span>
                    <div className="text-xl font-black text-muted-foreground font-mono">
                      R$ 0,00
                    </div>
                    <span className="text-[10px] text-muted-foreground block">
                      {Number(peanutStock?.ownUnitCost || 0) > 0
                        ? `Custo interno período: R$ ${Number(peanutStock?.periodOwnCostTotal || 0).toFixed(2)}`
                        : "Fornecimento 100% próprio"}
                    </span>
                  </Card>
                </div>

                {/* Formulário Semântico de Movimentação */}
                <form
                  onSubmit={handleSubmitPeanutMovement}
                  aria-labelledby="peanut-stock-form-title"
                  className="bg-card border border-border rounded-3xl p-4 sm:p-5 space-y-4"
                >
                  <div>
                    <h4 id="peanut-stock-form-title" className="text-sm font-black text-foreground">
                      Lançar Movimentação ou Ajustar Inventário Físico
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Use "Definir Saldo Físico Atual" na primeira contagem e "Entrada de Compra" sempre que repor novas caixas.
                    </p>
                  </div>

                  <fieldset className="space-y-2">
                    <legend className="text-xs font-bold text-foreground mb-1.5">
                      Tipo de Movimentação *
                    </legend>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div
                        className={`p-3 rounded-2xl border flex items-center gap-2.5 text-xs font-bold ${
                          peanutMovType === "entry"
                            ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            : "border-border bg-muted/30 text-foreground"
                        }`}
                      >
                        <input
                          type="radio"
                          id="peanut-type-entry"
                          name="peanutMovementType"
                          value="entry"
                          checked={peanutMovType === "entry"}
                          onChange={() => setPeanutMovType("entry")}
                          className="accent-emerald-600 w-4 h-4 shrink-0"
                        />
                        <label htmlFor="peanut-type-entry" className="cursor-pointer flex-1">
                          ➕ Entrada de Compra / Reposição
                        </label>
                      </div>

                      <div
                        className={`p-3 rounded-2xl border flex items-center gap-2.5 text-xs font-bold ${
                          peanutMovType === "set_balance"
                            ? "border-sky-500 bg-sky-500/10 text-sky-700 dark:text-sky-300"
                            : "border-border bg-muted/30 text-foreground"
                        }`}
                      >
                        <input
                          type="radio"
                          id="peanut-type-set-balance"
                          name="peanutMovementType"
                          value="set_balance"
                          checked={peanutMovType === "set_balance"}
                          onChange={() => setPeanutMovType("set_balance")}
                          className="accent-sky-600 w-4 h-4 shrink-0"
                        />
                        <label htmlFor="peanut-type-set-balance" className="cursor-pointer flex-1">
                          📋 Definir Saldo Físico Atual (Inventário)
                        </label>
                      </div>

                      <div
                        className={`p-3 rounded-2xl border flex items-center gap-2.5 text-xs font-bold ${
                          peanutMovType === "manual_out"
                            ? "border-rose-500 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                            : "border-border bg-muted/30 text-foreground"
                        }`}
                      >
                        <input
                          type="radio"
                          id="peanut-type-manual-out"
                          name="peanutMovementType"
                          value="manual_out"
                          checked={peanutMovType === "manual_out"}
                          onChange={() => setPeanutMovType("manual_out")}
                          className="accent-rose-600 w-4 h-4 shrink-0"
                        />
                        <label htmlFor="peanut-type-manual-out" className="cursor-pointer flex-1">
                          ➖ Baixa Avulsa / Avaria
                        </label>
                      </div>
                    </div>
                  </fieldset>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                    <div className="space-y-1.5">
                      <Label htmlFor="peanut-mov-qty" className="text-xs font-bold">
                        {peanutMovType === "set_balance" ? "Saldo Físico Contado (un.) *" : "Quantidade (un.) *"}
                      </Label>
                      <Input
                        id="peanut-mov-qty"
                        name="peanutMovQty"
                        type="text"
                        inputMode="numeric"
                        required
                        placeholder={peanutMovType === "set_balance" ? "Ex: 120" : "Ex: 50"}
                        value={peanutMovQty}
                        onChange={e => setPeanutMovQty(e.target.value.replace(/\D/g, ""))}
                        className="h-9 text-xs rounded-xl font-mono"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="peanut-mov-threshold" className="text-xs font-bold">
                        Estoque Mínimo p/ Alerta (un.)
                      </Label>
                      <Input
                        id="peanut-mov-threshold"
                        name="peanutMovThreshold"
                        type="text"
                        inputMode="numeric"
                        placeholder="30"
                        value={peanutMovThreshold}
                        onChange={e => setPeanutMovThreshold(e.target.value.replace(/\D/g, ""))}
                        className="h-9 text-xs rounded-xl font-mono"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="peanut-mov-cost" className="text-xs font-bold">
                        Custo Próprio Unit. (R$ opcional)
                      </Label>
                      <Input
                        id="peanut-mov-cost"
                        name="peanutMovCost"
                        type="text"
                        inputMode="decimal"
                        placeholder="0,00"
                        value={peanutMovCost}
                        onChange={e => setPeanutMovCost(e.target.value)}
                        aria-describedby="peanut-own-cost-help"
                        className="h-9 text-xs rounded-xl font-mono"
                      />
                      <span id="peanut-own-cost-help" className="text-[10px] text-muted-foreground block">
                        Apenas para relatório interno CorpFlats; repasse Anserve permanece R$ 0,00.
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="peanut-mov-notes" className="text-xs font-bold">
                        Observação
                      </Label>
                      <Input
                        id="peanut-mov-notes"
                        name="peanutMovNotes"
                        type="text"
                        placeholder="Ex: Caixa c/ 100 un. fornecedor"
                        value={peanutMovNotes}
                        onChange={e => setPeanutMovNotes(e.target.value)}
                        className="h-9 text-xs rounded-xl"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                    <Button
                      type="submit"
                      disabled={savingPeanutStock}
                      className="rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white h-9"
                    >
                      {savingPeanutStock ? "Registrando..." : "Registrar Movimentação"}
                    </Button>
                  </div>
                </form>

                {/* Tabelas Responsivas Acessíveis */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card className="rounded-3xl border border-border overflow-hidden w-full min-w-0">
                    <CardHeader className="p-4 border-b border-border bg-muted/20">
                      <CardTitle id="peanut-flat-table-title" className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                        Saída de Amendoim por Flat no Período
                      </CardTitle>
                    </CardHeader>
                    <div
                      tabIndex={0}
                      role="region"
                      aria-labelledby="peanut-flat-table-title"
                      className="w-full overflow-auto max-h-[380px]"
                    >
                      <table className="w-full min-w-[400px] text-xs text-left">
                        <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur-xs text-muted-foreground font-bold border-b border-border">
                          <tr>
                            <th className="p-3">Flat</th>
                            <th className="p-3 text-center">Consumo Hóspedes</th>
                            <th className="p-3 text-center">Ajustes Internos</th>
                            <th className="p-3 text-right">Total Consumido</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {(!peanutStock?.byFlat || peanutStock.byFlat.length === 0) ? (
                            <tr>
                              <td colSpan={4} className="p-6 text-center text-muted-foreground">
                                Nenhuma saída de amendoim registrada no período.
                              </td>
                            </tr>
                          ) : (
                            peanutStock.byFlat.map((f: any) => (
                              <tr key={f.flatNumber} className="hover:bg-muted/20">
                                <td className="p-3 font-black text-foreground">Flat {f.flatNumber}</td>
                                <td className="p-3 text-center font-mono">{f.guestConsumed} un.</td>
                                <td className="p-3 text-center font-mono text-muted-foreground">{f.internalConsumed} un.</td>
                                <td className="p-3 text-right font-mono font-black text-amber-600">{f.totalConsumed} un.</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </Card>

                  <Card className="rounded-3xl border border-border overflow-hidden w-full min-w-0">
                    <CardHeader className="p-4 border-b border-border bg-muted/20">
                      <CardTitle id="peanut-mov-table-title" className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                        Histórico de Entradas, Inventários e Baixas Manuais
                      </CardTitle>
                    </CardHeader>
                    <div
                      tabIndex={0}
                      role="region"
                      aria-labelledby="peanut-mov-table-title"
                      className="w-full overflow-auto max-h-[420px]"
                    >
                      <table className="w-full min-w-[560px] text-xs text-left">
                        <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur-xs text-muted-foreground font-bold border-b border-border">
                          <tr>
                            <th className="p-3">Data/Hora</th>
                            <th className="p-3">Tipo</th>
                            <th className="p-3 text-center">Qtd Informada</th>
                            <th className="p-3 text-center">Impacto Saldo</th>
                            <th className="p-3">Observação</th>
                            <th className="p-3">Responsável</th>
                            <th className="p-3 text-center w-12">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {(!peanutStock?.movements || peanutStock.movements.length === 0) ? (
                            <tr>
                              <td colSpan={7} className="p-6 text-center text-muted-foreground">
                                Nenhuma movimentação manual lançada ainda.
                              </td>
                            </tr>
                          ) : (
                            peanutStock.movements.map((m: any) => (
                              <tr key={m.id} className="hover:bg-muted/20">
                                <td className="p-3 font-mono text-[11px] whitespace-nowrap">
                                  {m.createdAt ? new Date(m.createdAt).toLocaleString("pt-BR") : "-"}
                                </td>
                                <td className="p-3">
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] font-bold ${
                                      m.type === "entry"
                                        ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                                        : m.type === "set_balance"
                                        ? "border-sky-500/40 text-sky-700 dark:text-sky-300"
                                        : "border-rose-500/40 text-rose-700 dark:text-rose-300"
                                    }`}
                                  >
                                    {m.type === "entry"
                                      ? "Entrada"
                                      : m.type === "set_balance"
                                      ? "Inventário"
                                      : "Baixa"}
                                  </Badge>
                                </td>
                                <td className="p-3 text-center font-mono font-bold">{m.quantity} un.</td>
                                <td
                                  className={`p-3 text-center font-mono font-black ${
                                    Number(m.delta) >= 0 ? "text-emerald-600" : "text-rose-600"
                                  }`}
                                >
                                  {Number(m.delta) >= 0 ? `+${m.delta}` : m.delta}
                                </td>
                                <td className="p-3 text-muted-foreground max-w-[160px] truncate" title={m.notes || ""}>
                                  {m.notes || "-"}
                                </td>
                                <td className="p-3 text-muted-foreground">{m.createdBy || "Admin"}</td>
                                <td className="p-3 text-center">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDeletePeanutMovement(m)}
                                    title="Excluir movimentação manual"
                                    className="h-7 w-7 rounded-lg text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </div>
              </div>
            )}
          </TabsContent>
          )}

          {/* ABA EQUIPE: EQUIPE & ACESSOS ANSERVE */}
          <TabsContent value="equipe" className="w-full min-w-0 space-y-5">
            <div className="bg-card border border-border p-4 sm:p-5 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full min-w-0">
              <div className="space-y-1 min-w-0">
                <h3 className="text-sm sm:text-base font-black text-foreground flex items-center gap-2">
                  <Users className="w-5 h-5 text-teal-600 shrink-0" />
                  <span>
                    {isCorpFlatsAdmin
                      ? "Gestão Geral da Equipe Anserve (Gestores, Repositoras & Faturamento NF)"
                      : "Equipe de Reposição & Faturamento Anserve"}
                  </span>
                </h3>
                <p className="text-xs text-muted-foreground">
                  Gerencie os logins da operação Anserve. Ao cadastrar com WhatsApp, o colaborador recebe automaticamente o link direto, login e senha inicial.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 shrink-0 w-full sm:w-auto">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleExportProductivityCsv}
                  className="rounded-xl text-xs font-bold h-9 gap-1.5 w-full sm:w-auto"
                >
                  <Download className="w-4 h-4" />
                  <span>Exportar Produtividade (CSV)</span>
                </Button>
                {isCorpFlatsAdmin && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleOpenCreateStaff("anserve_gestor")}
                    className="rounded-xl text-xs font-bold h-9 gap-1.5 border-teal-500/40 text-teal-700 dark:text-teal-300 w-full sm:w-auto"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>Novo Gestor</span>
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handleOpenCreateStaff("anserve_faturamento")}
                  className="rounded-xl text-xs font-bold h-9 gap-1.5 border-indigo-500/40 text-indigo-700 dark:text-indigo-300 w-full sm:w-auto"
                >
                  <Plus className="w-4 h-4" />
                  <span>Novo Emissor NF</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleOpenCreateStaff("anserve_repositora")}
                  className="rounded-xl text-xs font-bold h-9 gap-1.5 bg-primary text-primary-foreground w-full sm:w-auto"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Nova Repositora</span>
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {[
                { key: "todos", label: `Todos (${visibleStaff.length})` },
                ...(isCorpFlatsAdmin
                  ? [
                      {
                        key: "anserve_gestor",
                        label: `Gestores (${visibleStaff.filter(s => s.role === "anserve_gestor").length})`
                      }
                    ]
                  : []),
                {
                  key: "anserve_repositora",
                  label: `Repositoras (${visibleStaff.filter(s => s.role === "anserve_repositora").length})`
                },
                {
                  key: "anserve_faturamento",
                  label: `Emissão de NF (${visibleStaff.filter(s => s.role === "anserve_faturamento").length})`
                }
              ].map(f => (
                <Button
                  key={f.key}
                  type="button"
                  size="sm"
                  variant={staffRoleFilter === f.key ? "default" : "outline"}
                  onClick={() => setStaffRoleFilter(f.key)}
                  className="h-8 rounded-xl text-xs font-bold"
                >
                  {f.label}
                </Button>
              ))}
            </div>

            <Card className="rounded-3xl border border-border overflow-hidden w-full min-w-0">
              <div
                tabIndex={0}
                role="region"
                aria-label="Tabela de colaboradores da equipe Anserve"
                className="w-full overflow-x-auto max-h-[520px]"
              >
                <table className="w-full min-w-[680px] text-xs text-left border-separate border-spacing-0">
                  <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur text-muted-foreground font-bold border-b border-border">
                    <tr>
                      <th className="p-3.5">Colaborador</th>
                      <th className="p-3.5">Cargo / Perfil</th>
                      <th className="p-3.5">WhatsApp & PIN</th>
                      <th className="p-3.5 text-center">Status</th>
                      <th className="p-3.5 text-center">Passagens</th>
                      <th className="p-3.5 text-center">Itens Repostos</th>
                      <th className="p-3.5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredStaff.map(member => {
                      const p = member.productivity;
                      return (
                        <tr key={member.id} className="hover:bg-muted/20">
                          <td className="p-3.5">
                            <div className="font-bold text-foreground">{member.name}</div>
                            <div className="text-[10px] font-mono text-muted-foreground">@{member.username}</div>
                          </td>
                          <td className="p-3.5">
                            {member.role === "anserve_gestor" ? (
                              <Badge className="bg-teal-500/15 text-teal-700 border-teal-500/30 text-[10px] font-bold">
                                👔 Gestor Anserve
                              </Badge>
                            ) : member.role === "anserve_faturamento" ? (
                              <Badge className="bg-indigo-500/15 text-indigo-700 border-indigo-500/30 text-[10px] font-bold">
                                📄 Emissão de NF
                              </Badge>
                            ) : (
                              <Badge className="bg-sky-500/15 text-sky-700 border-sky-500/30 text-[10px] font-bold">
                                🧹 Repositora
                              </Badge>
                            )}
                          </td>
                          <td className="p-3.5 font-mono text-[11px]">
                            <div>{member.whatsapp || "Sem WhatsApp"}</div>
                            {member.role === "anserve_repositora" && (
                              <div className="text-[10px] text-muted-foreground">
                                PIN: <strong className="text-foreground">{member.pin || "1234"}</strong>
                              </div>
                            )}
                          </td>
                          <td className="p-3.5 text-center">
                            {member.active !== false ? (
                              <Badge className="bg-emerald-500/15 text-emerald-700 text-[10px]">Ativo</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px]">
                                Inativo
                              </Badge>
                            )}
                          </td>
                          <td className="p-3.5 text-center font-mono font-bold">
                            {p?.inspectionsCount || 0} ({p?.flatsVisitedCount || 0} flats)
                          </td>
                          <td className="p-3.5 text-center font-mono text-sky-600 font-bold">
                            {p?.totalItemsRestockedQty || 0} un.
                          </td>
                          <td className="p-3.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setHistoryModalStaff(member)}
                                className="h-7 px-2 rounded-lg text-[11px] font-bold text-primary"
                              >
                                <Eye className="w-3.5 h-3.5 mr-1" />
                                Histórico
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleOpenEditStaff(member)}
                                className="h-7 w-7 rounded-lg"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => {
                                  setResetModalStaff(member);
                                  setResetPasswordInput("");
                                  setResetPinInput(member.pin || "");
                                }}
                                className="h-7 w-7 rounded-lg text-amber-600"
                              >
                                <Key className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleDeleteStaff(member)}
                                className="h-7 w-7 rounded-lg text-rose-600"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Celular de Trabalho das Repositoras */}
            <Card className="rounded-3xl border border-teal-500/30 bg-teal-500/5 p-4 sm:p-5 space-y-4 w-full min-w-0">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Phone className="w-4 h-4 text-teal-600 shrink-0" />
                    <h4 className="text-xs sm:text-sm font-black text-foreground">
                      WhatsApp Exclusivo de Trabalho das Repositoras (Avisos de Check-out)
                    </h4>
                    <Badge className="bg-teal-600 text-white text-[10px]">Celular de Trabalho</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Cadastre o número do WhatsApp do celular de trabalho das repositoras. Recebe o resumo no <strong>1º login do dia</strong> e alertas automáticos <strong>a cada novo check-out</strong>.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                  <Input
                    placeholder="Ex: 11999999999"
                    value={restockerWorkWhatsapp}
                    onChange={e => setRestockerWorkWhatsapp(e.target.value)}
                    className="h-9 w-full sm:w-48 text-xs font-mono rounded-xl bg-background"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSaveRestockerWorkWhatsapp}
                    disabled={savingWorkWhatsapp}
                    className="h-9 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white"
                  >
                    {savingWorkWhatsapp ? "Salvando..." : "Salvar WhatsApp"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleSendTestCheckoutSummary}
                    disabled={sendingTestSummary || !restockerWorkWhatsapp.trim()}
                    className="h-9 rounded-xl text-xs font-bold border-teal-500/40 text-teal-700 dark:text-teal-300"
                  >
                    <Send className="w-3.5 h-3.5 mr-1.5" />
                    {sendingTestSummary ? "Enviando..." : "Testar Resumo Agora"}
                  </Button>
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Modal: Criar / Editar Produto */}
        <Dialog open={productModalOpen} onOpenChange={setProductModalOpen}>
          <DialogContent className="sm:max-w-md rounded-3xl p-6">
            <DialogHeader>
              <DialogTitle className="text-base font-black flex items-center gap-2">
                <Package className="w-5 h-5 text-primary" />
                <span>{editingProduct ? "Editar Produto" : "Novo Produto de Frigobar"}</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                Configure os preços, foto, custos e padrão nominal no flat.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveProduct} className="space-y-4 py-2 text-xs">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Nome do Produto *</Label>
                <Input
                  required
                  placeholder="ex: Cerveja Heineken 330ml"
                  value={pName}
                  onChange={e => setPName(e.target.value)}
                  className="h-9 text-xs rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Categoria</Label>
                <select
                  value={pCategory}
                  onChange={e => setPCategory(e.target.value)}
                  className="w-full h-9 rounded-xl border border-input bg-background px-3 font-medium text-xs"
                >
                  {CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Preço de Venda (R$) *</Label>
                  <Input
                    required
                    placeholder="10.00"
                    value={pPrice}
                    onChange={e => setPPrice(e.target.value)}
                    className="h-9 text-xs rounded-xl font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">
                    {editingProduct?.id === "prod_amendoim_mendorato"
                      ? "Custo Próprio CorpFlats (R$) — Sem Repasse Anserve"
                      : "Custo / Repasse Anserve (R$)"}
                  </Label>
                  <Input
                    placeholder={editingProduct?.id === "prod_amendoim_mendorato" ? "0.00" : "6.50"}
                    value={pCost}
                    onChange={e => setPCost(e.target.value)}
                    className="h-9 text-xs rounded-xl font-mono"
                  />
                  {editingProduct?.id === "prod_amendoim_mendorato" && (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold block">
                      O amendoim nunca gera repasse financeiro para a Anserve (apenas controle interno).
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">URL da Imagem / Foto</Label>
                <Input
                  placeholder="https://images.unsplash.com/..."
                  value={pImageUrl}
                  onChange={e => setPImageUrl(e.target.value)}
                  className="h-9 text-xs rounded-xl font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Descrição Curta</Label>
                <Input
                  placeholder="ex: Long neck gelada 330ml"
                  value={pDescription}
                  onChange={e => setPDescription(e.target.value)}
                  className="h-9 text-xs rounded-xl"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-2xl bg-muted/40 border border-border">
                <div className="space-y-0.5">
                  <span className="font-bold text-foreground">Item de Cortesia Gratuita</span>
                  <p className="text-[10px] text-muted-foreground">
                    Marca como cortesia de boas-vindas oferecida no check-in (ex: Cápsula Nespresso, Balas).
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={pIsCourtesy}
                  onChange={e => setPIsCourtesy(e.target.checked)}
                  className="w-4 h-4 accent-primary rounded"
                />
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setProductModalOpen(false)}
                  className="rounded-xl text-xs font-bold"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={savingProduct}
                  className="rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {savingProduct ? "Salvando..." : "Salvar Produto"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Modal: Criar / Editar Colaborador Anserve (Gestor ou Repositora) */}
        <Dialog open={staffModalOpen} onOpenChange={setStaffModalOpen}>
          <DialogContent className="sm:max-w-md rounded-3xl p-6">
            <DialogHeader>
              <DialogTitle className="text-base font-black flex items-center gap-2">
                <Users className="w-5 h-5 text-teal-600" />
                <span>{editingStaff ? "Editar Colaborador Anserve" : "Novo Colaborador Anserve"}</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                Gerencie tanto os Gestores/Supervisores da Anserve quanto as Funcionárias de Reposição.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveStaff} className="space-y-3.5 py-2 text-xs">
              <div className="space-y-1.5">
                <Label htmlFor="staff-role-select" className="text-xs font-bold">
                  Cargo / Nível na Anserve
                </Label>
                <select
                  id="staff-role-select"
                  value={sRole}
                  onChange={e => setSRole(e.target.value as any)}
                  className="w-full h-9 rounded-xl border border-input bg-background px-3 font-bold text-xs"
                >
                  <option value="anserve_repositora">🧹 Funcionária de Reposição & Conferência (/frigobar-reposicao)</option>
                  <option value="anserve_faturamento">📄 Emissão de Notas Fiscais (/frigobar-notas)</option>
                  {isCorpFlatsAdmin && (
                    <option value="anserve_gestor">👔 Gestor / Supervisor Anserve (NFs, Vendas & Equipe)</option>
                  )}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Nome Completo *</Label>
                <Input
                  required
                  placeholder="ex: Carla Oliveira"
                  value={sName}
                  onChange={e => setSName(e.target.value)}
                  className="h-9 text-xs rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Login (@usuário) *</Label>
                  <Input
                    required
                    placeholder="ex: carla.anserve"
                    value={sUsername}
                    onChange={e => setSUsername(e.target.value)}
                    className="h-9 text-xs rounded-xl font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">PIN Mobile (4 dígitos)</Label>
                  <Input
                    placeholder="ex: 2580"
                    maxLength={6}
                    value={sPin}
                    onChange={e => setSPin(e.target.value.replace(/\D/g, ""))}
                    className="h-9 text-xs rounded-xl font-mono"
                  />
                </div>
              </div>

              {!editingStaff && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Senha Inicial (mín. 4 caracteres) *</Label>
                  <Input
                    required
                    type="password"
                    placeholder="••••••"
                    value={sPassword}
                    onChange={e => setSPassword(e.target.value)}
                    className="h-9 text-xs rounded-xl"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">WhatsApp</Label>
                  <Input
                    placeholder="22999999999"
                    value={sWhatsapp}
                    onChange={e => setSWhatsapp(e.target.value)}
                    className="h-9 text-xs rounded-xl font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Chave PIX</Label>
                  <Input
                    placeholder="Opcional"
                    value={sPixKey}
                    onChange={e => setSPixKey(e.target.value)}
                    className="h-9 text-xs rounded-xl"
                  />
                </div>
              </div>

              {!editingStaff && (
                <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-[11px] text-emerald-800 dark:text-emerald-300 space-y-0.5">
                  <span className="font-bold block">📲 Disparo Automático de Credenciais no WhatsApp</span>
                  <span>
                    Ao criar o colaborador com o WhatsApp preenchido acima, o sistema envia automaticamente uma mensagem com o link direto de acesso, login (@usuário), senha inicial e PIN!
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between p-3 rounded-2xl bg-muted/40 border border-border">
                <span className="font-bold text-foreground">Cadastro Ativo</span>
                <Switch checked={sActive} onCheckedChange={setSActive} />
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStaffModalOpen(false)}
                  className="rounded-xl text-xs font-bold"
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={savingStaff} className="rounded-xl text-xs font-bold">
                  {savingStaff ? "Salvando..." : "Salvar Colaborador"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Modal: Redefinir Senha / PIN */}
        <Dialog open={Boolean(resetModalStaff)} onOpenChange={() => setResetModalStaff(null)}>
          <DialogContent className="sm:max-w-md rounded-3xl p-6">
            <DialogHeader>
              <DialogTitle className="text-base font-black flex items-center gap-2">
                <Key className="w-5 h-5 text-amber-600" />
                <span>Redefinir Senha / PIN — {resetModalStaff?.name}</span>
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleResetStaffCredentials} className="space-y-4 py-2 text-xs">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Nova Senha</Label>
                <Input
                  placeholder="Digite a nova senha (mín. 4 caracteres)"
                  value={resetPasswordInput}
                  onChange={e => setResetPasswordInput(e.target.value)}
                  className="h-9 text-xs rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">PIN Mobile (4 dígitos)</Label>
                <Input
                  maxLength={6}
                  placeholder="ex: 2580"
                  value={resetPinInput}
                  onChange={e => setResetPinInput(e.target.value.replace(/\D/g, ""))}
                  className="h-9 text-xs rounded-xl font-mono"
                />
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setResetModalStaff(null)}
                  className="rounded-xl text-xs font-bold"
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={savingReset} className="rounded-xl text-xs font-bold">
                  Salvar Credenciais
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Modal: Relatório Individual */}
        <Dialog open={Boolean(historyModalStaff)} onOpenChange={() => setHistoryModalStaff(null)}>
          <DialogContent className="sm:max-w-2xl rounded-3xl p-6 max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base font-black">
                Histórico de Produtividade — {historyModalStaff?.name}
              </DialogTitle>
            </DialogHeader>
            {historyModalStaff && (
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-2xl bg-muted/40 border border-border">
                    <span className="text-[10px] text-muted-foreground block">Passagens & Lançamentos</span>
                    <strong className="text-base font-black">
                      {historyModalStaff.productivity?.inspectionsCount || 0}
                    </strong>
                  </div>
                  <div className="p-3 rounded-2xl bg-muted/40 border border-border">
                    <span className="text-[10px] text-muted-foreground block">Itens Lançados / Repostos</span>
                    <strong className="text-base font-black text-sky-600">
                      {historyModalStaff.productivity?.totalItemsRestockedQty || 0} un.
                    </strong>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Modal: Corrigir Contato / Reenviar Nota Fiscal */}
        <Dialog open={Boolean(retryModalOrder)} onOpenChange={() => setRetryModalOrder(null)}>
          <DialogContent className="sm:max-w-md rounded-3xl p-6">
            <DialogHeader>
              <DialogTitle className="text-base font-black flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-primary" />
                <span>Reenviar Nota Fiscal — {retryModalOrder?.id}</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                Corrija o WhatsApp ou E-mail do hóspede ({retryModalOrder?.guestName}) e dispare a Nota Fiscal novamente.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <div className="space-y-1">
                <Label className="text-xs font-bold">WhatsApp do Hóspede (com DDD)</Label>
                <Input
                  placeholder="(11) 99999-9999"
                  value={retryPhoneInput}
                  onChange={e => setRetryPhoneInput(e.target.value)}
                  className="h-9 text-xs rounded-xl"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold">E-mail do Hóspede</Label>
                <Input
                  type="email"
                  placeholder="hospede@email.com"
                  value={retryEmailInput}
                  onChange={e => setRetryEmailInput(e.target.value)}
                  className="h-9 text-xs rounded-xl"
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                variant="outline"
                onClick={() => setRetryModalOrder(null)}
                className="rounded-xl text-xs font-bold"
              >
                Cancelar
              </Button>
              <Button
                disabled={retryingInvoice}
                onClick={handleConfirmRetryInvoice}
                className="rounded-xl text-xs font-bold bg-primary text-primary-foreground"
              >
                {retryingInvoice ? "Reenviando..." : "Salvar Contato e Reenviar NF"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal: Reabrir Pedido Pago como Pendente (Auditoria Admin) */}
        <Dialog
          open={Boolean(reopenSalesOrder)}
          onOpenChange={(open) => {
            if (!open) {
              setReopenSalesOrder(null);
              setReopenSalesReason("");
              setReopenSalesError(null);
            }
          }}
        >
          <DialogContent className="sm:max-w-md rounded-3xl p-6">
            <DialogHeader>
              <DialogTitle className="text-base font-black flex items-center gap-2 text-amber-700 dark:text-amber-300">
                <RotateCcw className="w-5 h-5 shrink-0" />
                <span>Reabrir Pedido Pago — {reopenSalesOrder?.id}</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                Flat {reopenSalesOrder?.flatNumber} • {reopenSalesOrder?.guestName || "Hóspede"} • R${" "}
                {Number(reopenSalesOrder?.totalAmount || 0).toFixed(2)}. O pedido voltará ao status{" "}
                <strong>Pendente</strong> e ficará disponível para cobrança novamente.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleConfirmReopenSalesOrder} noValidate className="space-y-4 py-2 text-xs">
              <div className="space-y-1.5">
                <Label htmlFor="reopen-sales-reason" className="text-xs font-bold">
                  Motivo da Reabertura <span aria-hidden="true">*</span>
                </Label>
                <Textarea
                  ref={reopenSalesReasonRef}
                  id="reopen-sales-reason"
                  name="reopenSalesReason"
                  required
                  minLength={3}
                  rows={3}
                  aria-invalid={Boolean(reopenSalesError)}
                  aria-describedby={reopenSalesError ? "reopen-sales-error" : "reopen-sales-help"}
                  placeholder="Ex: PIX não entrou no extrato Banco Inter / marcado como pago por engano..."
                  value={reopenSalesReason}
                  onChange={(e) => {
                    setReopenSalesReason(e.target.value);
                    if (reopenSalesError && e.target.value.trim().length >= 3) {
                      setReopenSalesError(null);
                    }
                  }}
                  className="text-xs rounded-xl"
                />
                {reopenSalesError ? (
                  <p id="reopen-sales-error" role="alert" className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                    {reopenSalesError}
                  </p>
                ) : (
                  <p id="reopen-sales-help" className="text-[10px] text-muted-foreground">
                    O motivo fica registrado na auditoria interna do frigobar (mínimo 3 caracteres).
                  </p>
                )}
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setReopenSalesOrder(null);
                    setReopenSalesReason("");
                    setReopenSalesError(null);
                  }}
                  className="rounded-xl text-xs font-bold"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={reopeningSalesOrder}
                  className="rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {reopeningSalesOrder ? "Reabrindo..." : "Confirmar Reabertura"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Shell>
  );
}
