import React, { useState, useEffect, useMemo } from "react";
import { Shell } from "@/components/layout";
import { useGetMe } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import {
  Package,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  QrCode,
  Printer,
  Sparkles,
  RefreshCw,
  Search,
  Sliders,
  DollarSign,
  Coffee,
  Check,
  X,
  ExternalLink,
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
  Briefcase
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
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
  globalTemplate?: Array<{ productId: string; quantity: number }> | Record<string, number>;
  flatOverrides?: Record<string, Array<{ productId: string; quantity: number }>>;
  courtesyItems?: Array<{ productId: string; freeQuantity: number }>;
}

const SOHO_FLATS = [
  "101", "102", "113", "114", "116", "211", "212", "215",
  "313", "408", "509", "511", "512", "605", "712", "715",
  "904", "905", "907", "1004", "1304"
];

const CATEGORIES = [
  "Água & Sucos",
  "Refrigerantes",
  "Cervejas & Alcoólicos",
  "Snacks & Chocolates",
  "Cafés & Especiais"
];

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
  const { data: user } = useGetMe();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<
    "insights" | "catalogo" | "gabarito" | "equipe" | "qrcodes" | "extrato"
  >("insights");

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

  // QR Codes State
  const [selectedFlatForQrPreview, setSelectedFlatForQrPreview] = useState<string | null>(null);
  const [qrOriginUrl] = useState(() => {
    if (typeof window !== "undefined") {
      return window.location.origin;
    }
    return "https://corpflats.com.br";
  });

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

  // Staff Management State (Both Gestores & Repositoras Anserve)
  const [staffList, setStaffList] = useState<any[]>([]);
  const [staffRoleFilter, setStaffRoleFilter] = useState<string>("todos");
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<any | null>(null);
  const [sName, setSName] = useState("");
  const [sUsername, setSUsername] = useState("");
  const [sPassword, setSPassword] = useState("");
  const [sRole, setSRole] = useState<"anserve_repositora" | "anserve_gestor">("anserve_repositora");
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

  const loadAll = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        fetchProducts(),
        fetchDefaultStock(),
        fetchSettlement(),
        fetchInsights360(),
        fetchAnserveStaff(),
        fetchDeliveryMonitor(),
        fetchMinibarSettings()
      ]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [extratoStartDate, extratoEndDate]);

  const loadQuantitiesForFlat = (flatKey: string, stockData: DefaultStockData | null) => {
    const data = stockData || defaultStock;
    if (!data) return;

    const map: Record<string, number> = {};
    if (flatKey === "global") {
      const template = data.globalTemplate;
      if (Array.isArray(template)) {
        template.forEach(item => {
          map[item.productId] = Number(item.quantity) || 0;
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
          map[item.productId] = Number(item.quantity) || 0;
        });
      } else {
        const template = data.globalTemplate;
        if (Array.isArray(template)) {
          template.forEach(item => {
            map[item.productId] = Number(item.quantity) || 0;
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
        quantity: Math.max(0, quantity)
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

  // Staff CRUD Handlers (Admin manages both Gestores and Repositoras)
  const handleOpenCreateStaff = (defaultRole: "anserve_repositora" | "anserve_gestor" = "anserve_repositora") => {
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
    setSRole(member.role === "anserve_gestor" ? "anserve_gestor" : "anserve_repositora");
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

  const handlePrintAllQrCodes = () => {
    window.print();
  };

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
    return staffList.filter(s => {
      if (staffRoleFilter !== "todos" && s.role !== staffRoleFilter) return false;
      return true;
    });
  }, [staffList, staffRoleFilter]);

  return (
    <Shell>
      {/* Estilos dedicados para impressão de cartões em Acrílico A6 */}
      <style>{`
        @media print {
          @page {
            size: A6 portrait;
            margin: 6mm;
          }
          html, body {
            background: white !important;
            color: black !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
          }
          aside, nav, header, footer, .print\\:hidden {
            display: none !important;
          }
          .print-qr-grid {
            display: block !important;
            width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .print-card-a6 {
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            border: 1.5px solid #000 !important;
            border-radius: 12px !important;
            padding: 14px 12px !important;
            width: 100% !important;
            max-width: 93mm !important;
            height: 136mm !important;
            max-height: 136mm !important;
            margin: 0 auto !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            align-items: center !important;
            text-align: center !important;
            box-sizing: border-box !important;
          }
          .print-card-a6:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
        }
      `}</style>

      <div className="w-full max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-3 sm:py-4 md:py-6 space-y-4 sm:space-y-6 pb-28 min-w-0 overflow-x-hidden print:hidden">
        {/* Header */}
        <div className="w-full min-w-0 bg-card border border-border p-4 sm:p-6 rounded-3xl shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
              <Package className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-xl md:text-2xl font-black text-foreground leading-tight break-words">
                  Central Estratégica de Frigobar (CorpFlats)
                </h1>
                <Badge className="bg-primary/15 text-primary border-primary/30 text-[10px] font-bold">
                  Diretoria & Inteligência 360°
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Insights exclusivos de consumo, gestão completa da Anserve (gestores e repositoras), catálogo, gabarito, QR Codes e repasse.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto shrink-0">
            <div className="flex items-center justify-between sm:justify-start gap-1.5 bg-muted/40 border border-border rounded-xl px-2.5 py-1.5 w-full sm:w-auto min-w-0">
              <Calendar className="w-3.5 h-3.5 text-primary shrink-0" />
              <input
                type="date"
                value={extratoStartDate}
                onChange={e => setExtratoStartDate(e.target.value)}
                className="bg-transparent text-[11px] sm:text-xs font-mono outline-none min-w-0 flex-1 sm:flex-initial"
              />
              <span className="text-[11px] text-muted-foreground shrink-0">até</span>
              <input
                type="date"
                value={extratoEndDate}
                onChange={e => setExtratoEndDate(e.target.value)}
                className="bg-transparent text-[11px] sm:text-xs font-mono outline-none min-w-0 flex-1 sm:flex-initial"
              />
            </div>

            <Button
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

        {/* Monitoramento Automático de Entrega de Notas Fiscais (WhatsApp + E-mail) */}
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

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="w-full min-w-0 space-y-4">
          <TabsList className="w-full bg-muted/50 p-1.5 rounded-2xl border border-border grid grid-cols-2 sm:flex sm:flex-wrap h-auto gap-1.5">
            <TabsTrigger value="insights" className="rounded-xl text-[11px] sm:text-xs font-bold px-2.5 sm:px-3.5 py-2 flex items-center justify-center gap-1.5 w-full sm:w-auto min-w-0">
              <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span className="truncate">Insights 360°</span>
              <Badge className="hidden sm:inline-flex bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 text-[9px] py-0 px-1.5 shrink-0">
                Só Admin
              </Badge>
            </TabsTrigger>

            <TabsTrigger value="catalogo" className="rounded-xl text-[11px] sm:text-xs font-bold px-2.5 sm:px-3.5 py-2 flex items-center justify-center gap-1.5 w-full sm:w-auto min-w-0">
              <Package className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="truncate">Catálogo & Cortesias</span>
            </TabsTrigger>

            <TabsTrigger value="gabarito" className="rounded-xl text-[11px] sm:text-xs font-bold px-2.5 sm:px-3.5 py-2 flex items-center justify-center gap-1.5 w-full sm:w-auto min-w-0">
              <Sliders className="w-3.5 h-3.5 text-sky-600 shrink-0" />
              <span className="truncate">Gabarito por Flat</span>
            </TabsTrigger>

            <TabsTrigger value="equipe" className="rounded-xl text-[11px] sm:text-xs font-bold px-2.5 sm:px-3.5 py-2 flex items-center justify-center gap-1.5 w-full sm:w-auto min-w-0">
              <Users className="w-3.5 h-3.5 text-teal-600 shrink-0" />
              <span className="truncate">Equipe Anserve</span>
            </TabsTrigger>

            <TabsTrigger value="qrcodes" className="rounded-xl text-[11px] sm:text-xs font-bold px-2.5 sm:px-3.5 py-2 flex items-center justify-center gap-1.5 w-full sm:w-auto min-w-0">
              <QrCode className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span className="truncate">QR Codes A6</span>
            </TabsTrigger>

            <TabsTrigger value="extrato" className="rounded-xl text-[11px] sm:text-xs font-bold px-2.5 sm:px-3.5 py-2 flex items-center justify-center gap-1.5 w-full sm:w-auto min-w-0">
              <DollarSign className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="truncate">Extrato Repasse</span>
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: CENTRAL DE INSIGHTS & INTELIGÊNCIA 360° (EXCLUSIVA ADMIN CORPFLATS) */}
          <TabsContent value="insights" className="w-full min-w-0 space-y-5">
            {/* Banner Exclusivo */}
            <div className="w-full min-w-0 bg-gradient-to-r from-indigo-950/90 via-slate-900 to-teal-950/90 text-white p-4 sm:p-5 rounded-3xl border border-indigo-500/30 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-md">
              <div className="space-y-1.5 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-amber-400 text-slate-950 font-black text-[10px] shrink-0">
                    🔒 EXCLUSIVO DIRETORIA CORPFLATS
                  </Badge>
                  <span className="text-[11px] sm:text-xs text-indigo-200 font-semibold">
                    Oculto para Gestores e Repositoras da Anserve
                  </span>
                </div>
                <h2 className="text-base sm:text-lg font-black leading-snug">
                  Inteligência Comportamental, Demográfica e Rentabilidade do Frigobar
                </h2>
                <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
                  Cruzamento automático de vendas com origem geográfica (FNRH/CRM), canal de reserva (Booking/Airbnb/Direto), perfil de reembolso corporativo, horários de pico, curva ABC e recuperação via IA Sofia.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:flex sm:flex-wrap gap-2 w-full md:w-auto shrink-0">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleExportDemographicsCsv}
                  className="rounded-xl text-xs font-bold h-8 gap-1.5 w-full sm:w-auto"
                >
                  <Download className="w-3.5 h-3.5" />
                  CSV Demografia
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleExportProductMatrixCsv}
                  className="rounded-xl text-xs font-bold h-8 gap-1.5 w-full sm:w-auto"
                >
                  <Download className="w-3.5 h-3.5" />
                  CSV Curva ABC
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleExportFlatsRankingCsv}
                  className="rounded-xl text-xs font-bold h-8 gap-1.5 w-full sm:w-auto"
                >
                  <Download className="w-3.5 h-3.5" />
                  CSV Flats
                </Button>
              </div>
            </div>

            {/* 6 Executive KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
              <Card className="rounded-2xl border border-border bg-card p-4 space-y-1">
                <span className="text-[11px] text-muted-foreground font-semibold">Receita Bruta</span>
                <div className="text-lg font-black text-foreground">
                  R$ {Number(insightsData?.kpis?.totalRevenue || 0).toFixed(2)}
                </div>
                <span className="text-[10px] text-muted-foreground block">
                  {insightsData?.kpis?.totalOrders || 0} pedidos pagos
                </span>
              </Card>

              <Card className="rounded-2xl border border-border bg-card p-4 space-y-1">
                <span className="text-[11px] text-muted-foreground font-semibold">Margem /Spread Bruto</span>
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
                  {insightsData?.kpis?.totalUnitsSold || 0} itens vendidos
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

              <Card className="rounded-2xl border border-border bg-card p-4 space-y-1">
                <span className="text-[11px] text-muted-foreground font-semibold">Autodeclaração Hóspede</span>
                <div className="text-lg font-black text-teal-600">
                  {insightsData?.lossAndRecovery?.honestyRatePct ?? 100}%
                </div>
                <span className="text-[10px] text-muted-foreground block">
                  Sem precisar de cobrança
                </span>
              </Card>

              <Card className="rounded-2xl border border-border bg-card p-4 space-y-1">
                <span className="text-[11px] text-muted-foreground font-semibold">Recuperação Sofia IA</span>
                <div className="text-lg font-black text-amber-600">
                  {insightsData?.kpis?.discrepancyRecoveryRatePct ?? 100}%
                </div>
                <span className="text-[10px] text-muted-foreground block">
                  R$ {Number(insightsData?.lossAndRecovery?.recoveredAmount || 0).toFixed(2)} recuperados
                </span>
              </Card>
            </div>

            {/* Mural de Descobertas & Curiosidades Automáticas */}
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

            {/* 1. GEOGRAFIA & DEMOGRAFIA: POR ESTADO (UF) E CIDADE */}
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

            {/* 2. CANAL DE RESERVA (OTA vs DIRETO) & REEMBOLSO CORPORATIVO (NOTA FISCAL) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 w-full min-w-0">
              <Card className="rounded-3xl border border-border overflow-hidden w-full min-w-0">
                <CardHeader className="p-4 border-b border-border bg-card">
                  <CardTitle className="text-sm font-black flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Consumo por Canal da Reserva (Direto vs. Booking vs. Airbnb)</span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Qual canal traz o hóspede que mais consome frigobar e qual dá mais divergência
                  </CardDescription>
                </CardHeader>
                <div className="w-full overflow-x-auto">
                  <table className="w-full min-w-[520px] text-xs text-left">
                    <thead className="bg-muted/40 text-muted-foreground font-bold border-b border-border">
                      <tr>
                        <th className="p-3">Canal de Origem</th>
                        <th className="p-3 text-center">Pedidos</th>
                        <th className="p-3">Categoria Líder</th>
                        <th className="p-3 text-center">Divergências</th>
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
                          <td className="p-3 text-center font-mono text-amber-600">{ch.discrepancies}</td>
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

            {/* 3. TEMPORALIDADE (DIA DA SEMANA & HORÁRIO) E PERFIL DE ESTADIA */}
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
                  <span>Faixa de Horário do Consumo</span>
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

            {/* 4. CURVA ABC DE PRODUTOS, MARGEM DE LUCRO & CESTA DE COMPRAS */}
            <Card className="rounded-3xl border border-border overflow-hidden w-full min-w-0">
              <CardHeader className="p-4 border-b border-border bg-card flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-black flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-primary shrink-0" />
                    <span>Matriz Curva ABC, Margem de Lucro & Diagnóstico de Giro do Catálogo</span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Identifique os produtos campeões (Classe A), os de maior margem e os itens encalhados para substituir no frigobar
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

            {/* Cesta de Compras (Market Basket) */}
            {Array.isArray(insightsData?.marketBasketPairs) && insightsData.marketBasketPairs.length > 0 && (
              <Card className="rounded-3xl border border-border p-4 space-y-3 w-full min-w-0">
                <div>
                  <h3 className="text-sm font-black text-foreground">
                    🤝 Cesta de Compras — Produtos Mais Consumidos Juntos na Mesma Estadia
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Descubra quais combinações os hóspedes mais fazem ao abrir o frigobar
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

            {/* 5. RANKING DE PERFORMANCE POR FLAT */}
            <Card className="rounded-3xl border border-border overflow-hidden w-full min-w-0">
              <CardHeader className="p-4 border-b border-border bg-card">
                <CardTitle className="text-sm font-black flex items-center gap-2">
                  <Award className="w-4 h-4 text-amber-500 shrink-0" />
                  <span>Ranking de Performance de Frigobar por Flat (19 UHs)</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Faturamento, ticket médio, taxa de divergência nas conferências e item campeão de cada flat
                </CardDescription>
              </CardHeader>
              <div className="w-full overflow-x-auto max-h-96">
                <table className="w-full min-w-[600px] text-xs text-left">
                  <thead className="bg-muted/40 text-muted-foreground font-bold border-b border-border sticky top-0">
                    <tr>
                      <th className="p-3">Flat</th>
                      <th className="p-3 text-center">Pedidos</th>
                      <th className="p-3 text-center">Unidades</th>
                      <th className="p-3">Produto Campeão</th>
                      <th className="p-3 text-center">Divergências</th>
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
                        <td className="p-3 text-center font-mono">
                          {f.discrepancyCount} ({f.discrepancyRatePct}%)
                        </td>
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
          </TabsContent>

          {/* TAB 2: CATÁLOGO */}
          <TabsContent value="catalogo" className="w-full min-w-0 space-y-4">
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

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar produto..."
                    value={productSearch}
                    onChange={e => setProductSearch(e.target.value)}
                    className="h-8 pl-9 text-xs rounded-xl"
                  />
                </div>

                <Button
                  size="sm"
                  onClick={() => handleOpenProductModal()}
                  className="rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 h-8 shrink-0 w-full sm:w-auto"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Novo Produto
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full min-w-0">
              {filteredProducts.map(p => (
                <Card key={p.id} className="rounded-3xl border border-border bg-card p-4 space-y-3 shadow-xs w-full min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt={p.name} className="w-12 h-12 rounded-2xl object-cover shrink-0" />
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
                        <span className="text-[11px] text-muted-foreground block">{p.category}</span>
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
                      <span className="text-[10px] text-muted-foreground block">Venda ao Hóspede:</span>
                      <strong className="text-sm font-black text-emerald-600">
                        R$ {Number(p.price).toFixed(2)}
                      </strong>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-muted-foreground block">Custo Repasse Anserve:</span>
                      <span className="text-xs font-mono font-semibold text-muted-foreground">
                        R$ {Number(p.cost || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* TAB 3: GABARITO POR FLAT */}
          <TabsContent value="gabarito" className="w-full min-w-0 space-y-4">
            <div className="bg-card border border-border p-4 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full min-w-0">
              <div className="space-y-0.5 min-w-0">
                <h3 className="text-sm font-bold text-foreground">Configuração do Gabarito Nominal do Frigobar</h3>
                <p className="text-xs text-muted-foreground">
                  Ajuste a quantidade padrão de cada item que deve constar no frigobar abastecido.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <span className="text-xs font-bold text-muted-foreground">Aplicar em:</span>
                <select
                  value={selectedFlatForStock}
                  onChange={e => handleSelectFlatForStock(e.target.value)}
                  className="h-8 text-xs rounded-xl border border-input bg-background px-3 font-bold flex-1 sm:flex-initial min-w-0"
                >
                  <option value="global">🌐 Padrão Global (Todos os Flats)</option>
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
                  className="rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 h-8 w-full sm:w-auto"
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
                        <img src={prod.imageUrl} alt={prod.name} className="w-9 h-9 rounded-xl object-cover shrink-0" />
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
          </TabsContent>

          {/* TAB 4: GESTÃO COMPLETA DE EQUIPE ANSERVE (GESTORES + FUNCIONÁRIAS) */}
          <TabsContent value="equipe" className="w-full min-w-0 space-y-5">
            <div className="bg-card border border-border p-4 sm:p-5 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full min-w-0">
              <div className="space-y-1 min-w-0">
                <h3 className="text-sm sm:text-base font-black text-foreground flex items-center gap-2">
                  <Users className="w-5 h-5 text-teal-600 shrink-0" />
                  <span>Gestão Geral da Equipe Anserve (Supervisores & Repositoras)</span>
                </h3>
                <p className="text-xs text-muted-foreground">
                  Como administrador da CorpFlats, você tem controle total sobre os Gestores da Anserve e todas as Funcionárias de Reposição.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 shrink-0 w-full sm:w-auto">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleOpenCreateStaff("anserve_gestor")}
                  className="rounded-xl text-xs font-bold h-9 gap-1.5 border-teal-500/40 text-teal-700 dark:text-teal-300 w-full sm:w-auto"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Novo Gestor Anserve</span>
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleOpenCreateStaff("anserve_repositora")}
                  className="rounded-xl text-xs font-bold h-9 gap-1.5 bg-primary text-primary-foreground w-full sm:w-auto"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Nova Funcionária (Repositora)</span>
                </Button>
              </div>
            </div>

            {/* WhatsApp Exclusivo de Trabalho das Repositoras (Avisos de Check-out e Resumo Diário) */}
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
                    Cadastre o número do WhatsApp do celular de trabalho das repositoras. Ao fazerem o <strong>1º login do dia</strong>, elas recebem o resumo dos flats já liberados (com horário) e quantos faltam sair. Além disso, <strong>a cada novo check-out</strong>, este número recebe o alerta imediato + resumo atualizado.
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
                    {sendingTestSummary ? "Enviando..." : "Enviar Resumo Agora"}
                  </Button>
                </div>
              </div>

              {checkoutSummary && (
                <div className="pt-2 border-t border-teal-500/20 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">
                    Status de hoje ({checkoutSummary.todayStr}):{" "}
                    <strong className="text-emerald-600">
                      {checkoutSummary.doneCount ?? checkoutSummary.checkedOutCount ?? 0} check-outs já realizados
                    </strong>{" "}
                    •{" "}
                    <strong className="text-amber-600">
                      {checkoutSummary.pendingCount ?? 0} previstos aguardando saída
                    </strong>
                  </span>
                  {(checkoutSummary.doneCheckouts || checkoutSummary.checkedOutTodayList || []).length > 0 && (
                    <span className="text-[11px] font-mono text-foreground">
                      Liberados:{" "}
                      {(checkoutSummary.doneCheckouts || checkoutSummary.checkedOutTodayList || [])
                        .map((c: any) => `Flat ${c.flatNumber} (${c.checkoutTime})`)
                        .join(", ")}
                    </span>
                  )}
                </div>
              )}
            </Card>

            <div className="flex flex-wrap items-center gap-2">
              {[
                { key: "todos", label: `Todos (${staffList.length})` },
                {
                  key: "anserve_gestor",
                  label: `Gestores Anserve (${staffList.filter(s => s.role === "anserve_gestor").length})`
                },
                {
                  key: "anserve_repositora",
                  label: `Repositoras (${staffList.filter(s => s.role === "anserve_repositora").length})`
                }
              ].map(f => (
                <Button
                  key={f.key}
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
              <div className="w-full overflow-x-auto">
                <table className="w-full min-w-[680px] text-xs text-left">
                  <thead className="bg-muted/40 text-muted-foreground font-bold border-b border-border">
                    <tr>
                      <th className="p-3.5">Colaborador</th>
                      <th className="p-3.5">Cargo / Perfil</th>
                      <th className="p-3.5">WhatsApp & PIN</th>
                      <th className="p-3.5 text-center">Status</th>
                      <th className="p-3.5 text-center">Vistorias</th>
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
                                Gestor / Supervisor Anserve
                              </Badge>
                            ) : (
                              <Badge className="bg-sky-500/15 text-sky-700 border-sky-500/30 text-[10px] font-bold">
                                Funcionária Repositora
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
                                Relatório
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
          </TabsContent>

          {/* TAB 5: GERADOR DE QR CODES A6 */}
          <TabsContent value="qrcodes" className="space-y-4">
            <div className="bg-card border border-border p-4 md:p-6 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-base font-black text-foreground flex items-center gap-2">
                  <QrCode className="w-5 h-5 text-indigo-600" />
                  <span>Displays de Acrílico A6 por Flat (Flats Soho)</span>
                </h3>
                <p className="text-xs text-muted-foreground">
                  Cada cartão aponta diretamente para a URL pública do respectivo flat. Imprima em papel couché ou adesivo para displays de balcão.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={handlePrintAllQrCodes}
                  className="rounded-2xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white h-9 px-4 shadow-sm"
                >
                  <Printer className="w-4 h-4 mr-1.5" />
                  Imprimir Todos (A6)
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {SOHO_FLATS.map(flatNumber => {
                const targetUrl = `${qrOriginUrl}/frigobar/flat/${flatNumber}`;
                const qrImgSrc = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(targetUrl)}`;

                return (
                  <Card
                    key={flatNumber}
                    className="rounded-3xl border-2 border-border/80 bg-card p-5 text-center flex flex-col items-center justify-between shadow-xs hover:border-indigo-500/50 transition-all space-y-3"
                  >
                    <div className="space-y-0.5">
                      <div className="text-[10px] font-black uppercase tracking-widest text-primary">
                        CORPFLATS • SOHO RESIDENCE
                      </div>
                      <div className="text-xl font-black text-foreground">FLAT {flatNumber}</div>
                    </div>

                    <div className="p-3 bg-white rounded-2xl shadow-xs border border-slate-200">
                      <img src={qrImgSrc} alt={`QR Code Flat ${flatNumber}`} className="w-36 h-36" />
                    </div>

                    <div className="space-y-1 text-[11px] text-muted-foreground">
                      <p className="font-bold text-foreground">Frigobar Express no seu celular</p>
                      <p className="text-[10px]">Aponte a câmera, confirme os 4 dígitos do telefone e aproveite!</p>
                    </div>

                    <div className="flex items-center justify-center gap-1.5 pt-1 text-[10px] font-bold text-muted-foreground">
                      <Badge variant="outline" className="text-[9px] py-0 px-1 border-muted">
                        PIX Inter
                      </Badge>
                      <Badge variant="outline" className="text-[9px] py-0 px-1 border-muted">
                        Cartão Crédito
                      </Badge>
                    </div>

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => window.open(`/frigobar/flat/${flatNumber}`, "_blank")}
                      className="w-full text-[11px] font-bold rounded-xl h-7 text-indigo-600 hover:text-indigo-700"
                    >
                      <ExternalLink className="w-3 h-3 mr-1" />
                      Visualizar & Testar
                    </Button>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* TAB 6: EXTRATO CORPFLATS ↔ ANSERVE */}
          <TabsContent value="extrato" className="space-y-5">
            {settlementData && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="rounded-3xl border border-border bg-card p-4 space-y-1">
                  <span className="text-[11px] text-muted-foreground font-semibold">Total Faturamento Bruto</span>
                  <div className="text-xl font-black text-foreground">
                    R$ {Number(settlementData.totalOrdersAmount || 0).toFixed(2)}
                  </div>
                  <span className="text-[10px] text-muted-foreground block">
                    {settlementData.ordersCount || 0} pedidos pagos
                  </span>
                </Card>

                <Card className="rounded-3xl border border-border bg-card p-4 space-y-1">
                  <span className="text-[11px] text-muted-foreground font-semibold">Taxas Financeiras Retidas</span>
                  <div className="text-xl font-black text-red-600 dark:text-red-400">
                    - R${" "}
                    {Number(
                      settlementData.totalFees || (settlementData.cardFees || 0) + (settlementData.pixFees || 0) || 0
                    ).toFixed(2)}
                  </div>
                  <span className="text-[10px] text-muted-foreground block">Mercado Pago + PIX Inter</span>
                </Card>

                <Card className="rounded-3xl border border-border bg-card p-4 space-y-1">
                  <span className="text-[11px] text-muted-foreground font-semibold">Comissão CorpFlats</span>
                  <div className="text-xl font-black text-amber-600 dark:text-amber-400">
                    - R$ {Number(settlementData.commissionCorpFlats || 0).toFixed(2)}
                  </div>
                  <span className="text-[10px] text-muted-foreground block">Retenção acordada de intermediação</span>
                </Card>

                <Card className="rounded-3xl border border-emerald-500/40 bg-emerald-500/10 p-4 space-y-1 shadow-md shadow-emerald-500/5">
                  <span className="text-[11px] text-emerald-800 dark:text-emerald-300 font-bold uppercase tracking-wide">
                    Repasse Líquido à Anserve
                  </span>
                  <div className="text-2xl font-black text-emerald-700 dark:text-emerald-300">
                    R$ {Number(settlementData.netPayableToAnserve || 0).toFixed(2)}
                  </div>
                  <span className="text-[10px] text-emerald-800/80 dark:text-emerald-300/80 block">
                    + R$ {Number(settlementData.courtesyRestockCost || 0).toFixed(2)} reembolsados em cortesias
                  </span>
                </Card>
              </div>
            )}
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
                  <Label className="text-xs font-bold">Custo / Repasse Anserve (R$)</Label>
                  <Input
                    placeholder="6.50"
                    value={pCost}
                    onChange={e => setPCost(e.target.value)}
                    className="h-9 text-xs rounded-xl font-mono"
                  />
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
                <Label className="text-xs font-bold">Cargo / Nível na Anserve</Label>
                <select
                  value={sRole}
                  onChange={e => setSRole(e.target.value as any)}
                  className="w-full h-9 rounded-xl border border-input bg-background px-3 font-bold text-xs"
                >
                  <option value="anserve_repositora">🧹 Funcionária de Reposição & Conferência</option>
                  <option value="anserve_gestor">👔 Gestor / Supervisor Anserve (NFs, Vendas & Equipe)</option>
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
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-2xl bg-muted/40 border border-border">
                    <span className="text-[10px] text-muted-foreground block">Conferências</span>
                    <strong className="text-base font-black">
                      {historyModalStaff.productivity?.inspectionsCount || 0}
                    </strong>
                  </div>
                  <div className="p-3 rounded-2xl bg-muted/40 border border-border">
                    <span className="text-[10px] text-muted-foreground block">Itens Repostos</span>
                    <strong className="text-base font-black text-sky-600">
                      {historyModalStaff.productivity?.totalItemsRestockedQty || 0} un.
                    </strong>
                  </div>
                  <div className="p-3 rounded-2xl bg-muted/40 border border-border">
                    <span className="text-[10px] text-muted-foreground block">Divergências</span>
                    <strong className="text-base font-black text-amber-600">
                      R$ {Number(historyModalStaff.productivity?.discrepancyAmountDetected || 0).toFixed(2)}
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
      </div>

      {/* RENDERIZAÇÃO LIMPA PARA IMPRESSÃO A6 (PRINT ONLY) */}
      <div className="hidden print:block print-qr-grid">
        {SOHO_FLATS.map(flatNumber => {
          const targetUrl = `${qrOriginUrl}/frigobar/flat/${flatNumber}`;
          const qrImgSrc = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(targetUrl)}`;

          return (
            <div key={flatNumber} className="print-card-a6">
              <div style={{ marginTop: "10px" }}>
                <div style={{ fontSize: "11px", fontWeight: "900", letterSpacing: "2px", color: "#333" }}>
                  CORPFLATS • SOHO RESIDENCE
                </div>
                <div style={{ fontSize: "32px", fontWeight: "900", marginTop: "4px" }}>FLAT {flatNumber}</div>
                <div style={{ fontSize: "13px", fontWeight: "700", color: "#555" }}>
                  🧊 Frigobar Express no seu Celular
                </div>
              </div>

              <div
                style={{
                  margin: "14px 0",
                  padding: "10px",
                  background: "white",
                  borderRadius: "12px",
                  border: "1px solid #ddd"
                }}
              >
                <img src={qrImgSrc} alt={`QR Code Flat ${flatNumber}`} style={{ width: "180px", height: "180px" }} />
              </div>

              <div style={{ fontSize: "11px", lineHeight: "1.4", maxWidth: "240px", marginBottom: "8px" }}>
                <strong>1.</strong> Aponte a câmera do seu celular para o QR Code acima.
                <br />
                <strong>2.</strong> Confirme os 4 últimos dígitos do seu telefone.
                <br />
                <strong>3.</strong> Escolha suas bebidas e pague via PIX ou Cartão.
              </div>

              <div
                style={{
                  fontSize: "9px",
                  color: "#666",
                  borderTop: "1px solid #eee",
                  paddingTop: "8px",
                  width: "100%"
                }}
              >
                Pagamento instantâneo via <strong>PIX Banco Inter</strong> e <strong>Cartão de Crédito</strong>.
                <br />
                Faturado separadamente da hospedagem.
              </div>
            </div>
          );
        })}
      </div>
    </Shell>
  );
}
