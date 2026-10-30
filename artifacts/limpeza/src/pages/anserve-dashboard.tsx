import React, { useState, useEffect, useMemo, useRef } from "react";
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
  UserPlus,
  Key,
  Edit2,
  Trash2,
  ExternalLink,
  Printer,
  ChevronRight,
  Filter,
  Sparkles,
  ArrowUpRight,
  BarChart3,
  Award,
  Eye,
  Phone,
  Lock,
  Check,
  X
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

export interface PendingInvoiceOrder {
  id: string;
  flatNumber: string;
  reservationCode: string;
  guestName: string;
  guestPhone?: string;
  guestEmail?: string;
  guestDocument?: string;
  totalAmount: number;
  paymentMethod: string;
  paymentStatus: string;
  paidAt?: string;
  createdAt: string;
  items: Array<{
    productId: string;
    productName?: string;
    quantity: number;
    unitPrice?: number;
    totalPrice?: number;
  }>;
  fiscalPreferences?: {
    invoiceDescriptionType?: "detailed" | "water" | "minibar_consumption" | string;
    documentType?: "cpf" | "cnpj";
    documentNumber?: string;
    companyName?: string;
    email?: string;
  };
  invoice?: {
    status: string;
    fileUrl?: string;
    invoiceNumber?: string;
    uploadedAt?: string;
  };
}

export interface SettlementData {
  totalOrdersAmount: number;
  cardOrdersAmount?: number;
  pixOrdersAmount?: number;
  cardFees: number;
  pixFees: number;
  totalFees: number;
  commissionCorpFlats: number;
  courtesyRestockCost: number;
  netPayableToAnserve: number;
  ordersCount: number;
  inspectionsCount: number;
  breakdowns?: {
    orders?: any[];
    inspections?: any[];
  };
}

export interface StaffProductivityMetrics {
  inspectionsCount: number;
  conformeCount: number;
  discrepancyCount: number;
  conformityRatePct: number;
  discrepancyAmountDetected: number;
  discrepancyAmountRecovered: number;
  paidItemsRestockedQty: number;
  courtesyItemsRestockedQty: number;
  totalItemsRestockedQty: number;
  paidItemsRestockedCost: number;
  courtesyItemsRestockedCost: number;
  flatsVisitedCount: number;
  flatsVisited: string[];
  lastInspectionAt: string | null;
  recentInspections: any[];
}

export interface AnserveStaffMember {
  id: number;
  username: string;
  name: string;
  role: "anserve_repositora" | "anserve_gestor" | string;
  whatsapp?: string;
  phone?: string;
  pixKey?: string;
  pin?: string;
  active: boolean;
  lastLoginAt?: string | null;
  createdAt?: string | null;
  productivity?: StaffProductivityMetrics;
}

const SOHO_FLATS = [
  "101", "102", "113", "114", "116", "211", "212", "215",
  "313", "408", "509", "511", "512", "605", "712", "715",
  "904", "905", "907", "1004", "1304"
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

export default function AnserveDashboardPage() {
  const { data: user } = useGetMe();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<"vendas" | "equipe" | "estoque">("vendas");

  // Data states
  const [pendingOrders, setPendingOrders] = useState<PendingInvoiceOrder[]>([]);
  const [settlement, setSettlement] = useState<SettlementData | null>(null);
  const [reportsData, setReportsData] = useState<any | null>(null);
  const [staffList, setStaffList] = useState<AnserveStaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });
  const [salesFlatFilter, setSalesFlatFilter] = useState("todos");
  const [salesStatusFilter, setSalesStatusFilter] = useState("todos");
  const [salesSearch, setSalesSearch] = useState("");
  const [invoiceSearch, setInvoiceSearch] = useState("");

  // Invoice attachment modal state
  const [selectedOrderForInvoice, setSelectedOrderForInvoice] = useState<PendingInvoiceOrder | null>(null);
  const [invoiceNumberInput, setInvoiceNumberInput] = useState("");
  const [invoiceFileData, setInvoiceFileData] = useState<string | null>(null);
  const [invoiceFileName, setInvoiceFileName] = useState("");
  const [uploadingInvoice, setUploadingInvoice] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Staff management modals state
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<AnserveStaffMember | null>(null);
  const [sName, setSName] = useState("");
  const [sUsername, setSUsername] = useState("");
  const [sRole, setSRole] = useState<"anserve_repositora" | "anserve_faturamento">("anserve_repositora");
  const [sPassword, setSPassword] = useState("");
  const [sWhatsapp, setSWhatsapp] = useState("");
  const [sPixKey, setSPixKey] = useState("");
  const [sPin, setSPin] = useState("");
  const [sActive, setSActive] = useState(true);
  const [savingStaff, setSavingStaff] = useState(false);

  // Reset Password / PIN modal
  const [resetModalStaff, setResetModalStaff] = useState<AnserveStaffMember | null>(null);
  const [resetPasswordInput, setResetPasswordInput] = useState("");
  const [resetPinInput, setResetPinInput] = useState("");
  const [savingReset, setSavingReset] = useState(false);

  // Staff Inspection History Modal
  const [historyModalStaff, setHistoryModalStaff] = useState<AnserveStaffMember | null>(null);

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
      console.error("[AnserveDashboard] Erro ao buscar configurações do frigobar:", err);
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
      console.error("[AnserveDashboard] Erro ao buscar monitor de entrega de NF:", err);
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
        fetchAnsReports();
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

  const fetchPendingInvoices = async () => {
    try {
      const res = await fetch("/api/minibar/invoices/pending", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.pendingInvoices)) {
          setPendingOrders(data.pendingInvoices);
        }
      }
    } catch (err) {
      console.error("[AnserveDashboard] Erro ao buscar NFs pendentes:", err);
    }
  };

  const fetchSettlement = async () => {
    try {
      const res = await fetch(`/api/minibar/settlement?startDate=${startDate}&endDate=${endDate}`, {
        credentials: "include"
      });
      if (res.ok) {
        const data = await res.json();
        setSettlement(data);
      }
    } catch (err) {
      console.error("[AnserveDashboard] Erro ao buscar extrato de repasse:", err);
    }
  };

  const fetchAnsReports = async () => {
    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
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
      console.error("[AnserveDashboard] Erro ao carregar relatórios Anserve:", err);
    }
  };

  const fetchStaff = async () => {
    try {
      const res = await fetch(
        `/api/minibar/staff?startDate=${startDate}&endDate=${endDate}&roleFilter=anserve_repositora`,
        { credentials: "include" }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.staff)) {
          setStaffList(data.staff.filter((u: AnserveStaffMember) => u.role === "anserve_repositora"));
        }
      }
    } catch (err) {
      console.error("[AnserveDashboard] Erro ao carregar equipe de reposição:", err);
    }
  };

  const loadAllData = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        fetchPendingInvoices(),
        fetchSettlement(),
        fetchAnsReports(),
        fetchStaff(),
        fetchDeliveryMonitor(),
        fetchMinibarSettings()
      ]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, [startDate, endDate, salesFlatFilter, salesStatusFilter]);

  // Handle file select for invoice upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setInvoiceFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setInvoiceFileData(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Submit invoice upload
  const handleUploadInvoice = async () => {
    if (!selectedOrderForInvoice || !invoiceFileData) {
      toast({
        title: "Arquivo obrigatório",
        description: "Selecione o arquivo PDF ou foto da Nota Fiscal para prosseguir.",
        variant: "destructive"
      });
      return;
    }

    setUploadingInvoice(true);
    try {
      const res = await fetch(`/api/minibar/orders/${selectedOrderForInvoice.id}/invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fileData: invoiceFileData,
          fileName: invoiceFileName || `NFE-${selectedOrderForInvoice.id}.pdf`,
          invoiceNumber: invoiceNumberInput.trim() || undefined
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast({
          title: "Nota Fiscal enviada com sucesso! 🚀",
          description: "O documento foi anexado e disparado automaticamente via WhatsApp (Z-API) e E-mail para o hóspede!"
        });
        setSelectedOrderForInvoice(null);
        setInvoiceFileData(null);
        setInvoiceFileName("");
        setInvoiceNumberInput("");
        fetchPendingInvoices();
        fetchAnsReports();
      } else {
        toast({
          title: "Erro ao anexar NF",
          description: data.error || "Tente novamente.",
          variant: "destructive"
        });
      }
    } catch (err: any) {
      toast({
        title: "Erro de comunicação",
        description: err.message || "Falha ao enviar arquivo.",
        variant: "destructive"
      });
    } finally {
      setUploadingInvoice(false);
    }
  };

  // Staff CRUD Handlers
  const handleOpenCreateStaff = () => {
    setEditingStaff(null);
    setSName("");
    setSUsername("");
    setSRole("anserve_repositora");
    setSPassword("");
    setSWhatsapp("");
    setSPixKey("");
    setSPin("");
    setSActive(true);
    setStaffModalOpen(true);
  };

  const handleOpenEditStaff = (member: AnserveStaffMember) => {
    setEditingStaff(member);
    setSName(member.name || member.username);
    setSUsername(member.username);
    setSRole((member.role === "anserve_faturamento" ? "anserve_faturamento" : "anserve_repositora") as any);
    setSPassword("");
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
        description: "Preencha o nome completo e o login (@usuário) da funcionária.",
        variant: "destructive"
      });
      return;
    }

    if (!editingStaff && sPassword.trim().length < 4) {
      toast({
        title: "Senha inválida",
        description: "A senha inicial deve ter pelo menos 4 caracteres.",
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
          title: editingStaff ? "Funcionária atualizada! ✅" : "Funcionária cadastrada! 🎉",
          description: `${sName.trim()} (@${sUsername.trim()}) já está pronta para operar.`
        });
        setStaffModalOpen(false);
        fetchStaff();
        fetchAnsReports();
      } else {
        toast({
          title: "Não foi possível salvar",
          description: data.error || "Verifique os dados informados.",
          variant: "destructive"
        });
      }
    } catch (err: any) {
      toast({
        title: "Erro de rede",
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
    if (!resetPasswordInput.trim() && resetPinInput === "") {
      toast({
        title: "Informe a nova credencial",
        description: "Digite uma nova senha ou um novo PIN de acesso.",
        variant: "destructive"
      });
      return;
    }

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
          description: data.message || `Senha/PIN de ${resetModalStaff.name} atualizado.`
        });
        setResetModalStaff(null);
        setResetPasswordInput("");
        setResetPinInput("");
        fetchStaff();
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

  const handleDeleteStaff = async (member: AnserveStaffMember) => {
    if (!confirm(`Tem certeza que deseja remover a funcionária "${member.name}" (@${member.username})?`)) {
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
          title: "Funcionária removida",
          description: `${member.name} foi excluída da equipe de reposição.`
        });
        fetchStaff();
        fetchAnsReports();
      } else {
        toast({
          title: "Erro ao excluir",
          description: data.error || "Não foi possível remover este cadastro.",
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

  // CSV Export Actions
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
      o.invoiceDescriptionType === "water"
        ? "Água"
        : o.invoiceDescriptionType === "minibar_consumption"
        ? "Consumo de Frigobar"
        : "Itens Discriminados",
      o.invoiceStatus === "anexada" ? `Emitida (${o.invoiceNumber || "OK"})` : "Pendente",
      o.paymentMethod === "pix" ? "PIX" : o.paymentMethod === "credit_card" ? "Cartão de Crédito" : "Pendente",
      o.paymentStatus === "pago" ? "Pago" : "Pendente",
      o.unitsCount || 0,
      o.itemsSummary || "",
      Number(o.totalAmount || 0).toFixed(2).replace(".", ","),
      Number(o.totalCost || 0).toFixed(2).replace(".", ",")
    ]);
    downloadCsvFile(`anserve_vendas_${startDate}_a_${endDate}.csv`, headers, rows);
    toast({
      title: "Relatório de Vendas exportado! 📊",
      description: "O arquivo CSV foi gerado para abertura no Excel."
    });
  };

  const handleExportProductsCsv = () => {
    const prods = reportsData?.salesSummary?.byProduct || [];
    if (prods.length === 0) {
      toast({
        title: "Sem produtos vendidos no período",
        description: "Não há saídas pagas para exportar.",
        variant: "destructive"
      });
      return;
    }
    const headers = [
      "ID Produto",
      "Produto",
      "Categoria",
      "Unidades Vendidas",
      "Preço Unitário (R$)",
      "Faturamento Bruto (R$)",
      "Custo Unitário (R$)",
      "Custo Total Repasse (R$)"
    ];
    const rows = prods.map((p: any) => [
      p.productId,
      p.productName,
      p.category,
      p.unitsSold,
      Number(p.unitPrice || 0).toFixed(2).replace(".", ","),
      Number(p.totalRevenue || 0).toFixed(2).replace(".", ","),
      Number(p.unitCost || 0).toFixed(2).replace(".", ","),
      Number(p.totalCost || 0).toFixed(2).replace(".", ",")
    ]);
    downloadCsvFile(`anserve_produtos_vendidos_${startDate}_a_${endDate}.csv`, headers, rows);
  };

  const handleExportProductivityCsv = () => {
    if (staffList.length === 0) {
      toast({
        title: "Sem dados de equipe",
        description: "Nenhuma funcionária listada para exportação.",
        variant: "destructive"
      });
      return;
    }
    const headers = [
      "Colaboradora",
      "Login",
      "Função",
      "Status",
      "WhatsApp",
      "PIN Mobile",
      "Total de Passagens",
      "Flats Atendidos",
      "Unidades Pagas Lançadas/Repostas",
      "Cortesias Repostas",
      "Total Itens Repostos",
      "Última Passagem"
    ];
    const rows = staffList.map(st => {
      const p = st.productivity;
      return [
        st.name,
        `@${st.username}`,
        st.role === "anserve_faturamento" ? "Emissão de NF" : "Repositora",
        st.active ? "Ativa" : "Inativa",
        st.whatsapp || "-",
        st.pin || "Padrão",
        p?.inspectionsCount || 0,
        p?.flatsVisitedCount || 0,
        p?.paidItemsRestockedQty || 0,
        p?.courtesyItemsRestockedQty || 0,
        p?.totalItemsRestockedQty || 0,
        p?.lastInspectionAt ? new Date(p.lastInspectionAt).toLocaleString("pt-BR") : "Sem registro"
      ];
    });
    downloadCsvFile(`anserve_produtividade_equipe_${startDate}_a_${endDate}.csv`, headers, rows);
    toast({
      title: "Produtividade exportada! 📋",
      description: "Planilha CSV de desempenho das funcionárias baixada com sucesso."
    });
  };

  const renderPreferenceBadge = (pref?: string) => {
    switch (pref) {
      case "water":
        return (
          <Badge className="bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30 font-bold text-[10px]">
            💧 Lançar como "Água"
          </Badge>
        );
      case "minibar_consumption":
        return (
          <Badge className="bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/30 font-bold text-[10px]">
            🧊 Consumo de Frigobar
          </Badge>
        );
      case "detailed":
      default:
        return (
          <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 font-bold text-[10px]">
            📄 Discriminar Todos os Itens
          </Badge>
        );
    }
  };

  const filteredOrders = useMemo(() => {
    return pendingOrders.filter(ord => {
      if (!invoiceSearch.trim()) return true;
      const q = invoiceSearch.toLowerCase().trim();
      return (
        ord.id.toLowerCase().includes(q) ||
        String(ord.flatNumber).toLowerCase().includes(q) ||
        ord.guestName.toLowerCase().includes(q) ||
        (ord.guestDocument && ord.guestDocument.includes(q)) ||
        (ord.reservationCode && ord.reservationCode.toLowerCase().includes(q))
      );
    });
  }, [pendingOrders, invoiceSearch]);

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

  return (
    <Shell>
      <div className="w-full max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-3 sm:py-4 md:py-6 space-y-4 sm:space-y-5 pb-28 min-w-0 overflow-x-hidden">
        <MinibarEcosystemNav currentScreen="anserve" pendingInvoicesCount={pendingOrders.length} />

        {/* Header Limpo & Direto */}
        <div className="w-full min-w-0 bg-card border border-border p-4 sm:p-6 rounded-3xl shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-xl md:text-2xl font-black text-foreground leading-tight break-words">
                  Painel do Gestor Anserve
                </h1>
                <Badge className="bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30 text-[10px] font-bold">
                  Vendas, Repasse & Equipe
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Acompanhe o faturamento do período, o valor líquido de repasse, gerencie a equipe de repositoras e acesse a central exclusiva de Notas Fiscais.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto shrink-0">
            <div className="flex items-center justify-between sm:justify-start gap-1.5 bg-muted/40 border border-border rounded-xl px-2.5 py-1.5 w-full sm:w-auto min-w-0">
              <Calendar className="w-3.5 h-3.5 text-teal-600 shrink-0" />
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="bg-transparent text-[11px] sm:text-xs font-mono outline-none min-w-0 flex-1 sm:flex-initial"
              />
              <span className="text-[11px] text-muted-foreground shrink-0">até</span>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="bg-transparent text-[11px] sm:text-xs font-mono outline-none min-w-0 flex-1 sm:flex-initial"
              />
            </div>

            <Button
              variant="default"
              size="sm"
              onClick={() => {
                window.location.href = "/frigobar-notas";
              }}
              className="rounded-xl text-xs font-bold h-9 w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <FileText className="w-3.5 h-3.5 mr-1.5" />
              <span>Central de Notas Fiscais</span>
              {pendingOrders.length > 0 && (
                <span className="ml-1.5 bg-amber-400 text-slate-950 text-[10px] font-black px-1.5 py-0.2 rounded-full">
                  {pendingOrders.length}
                </span>
              )}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={loadAllData}
              disabled={refreshing}
              className="rounded-xl text-xs font-bold h-9 w-full sm:w-auto"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </div>

        {/* 3 Abas Diretas e Organizadas */}
        <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="w-full min-w-0 space-y-4">
          <TabsList className="w-full bg-muted/50 p-1.5 rounded-2xl border border-border grid grid-cols-1 sm:grid-cols-3 h-auto gap-1.5">
            <TabsTrigger value="vendas" className="rounded-xl text-xs font-bold px-3.5 py-2.5 flex items-center justify-center gap-2 w-full">
              <DollarSign className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>1. Vendas & Repasse (CSV)</span>
            </TabsTrigger>

            <TabsTrigger value="equipe" className="rounded-xl text-xs font-bold px-3.5 py-2.5 flex items-center justify-center gap-2 w-full">
              <Users className="w-4 h-4 text-teal-600 shrink-0" />
              <span>2. Equipe & WhatsApp de Trabalho</span>
              <Badge variant="secondary" className="text-[10px] py-0 px-1.5 shrink-0">
                {staffList.length}
              </Badge>
            </TabsTrigger>

            <TabsTrigger value="estoque" className="rounded-xl text-xs font-bold px-3.5 py-2.5 flex items-center justify-center gap-2 w-full">
              <Package className="w-4 h-4 text-sky-600 shrink-0" />
              <span>3. Histórico de Lançamentos</span>
            </TabsTrigger>
          </TabsList>

          {/* ABA 1: VENDAS, EXTRATO DE REPASSE & EXPORTAÇÃO CSV */}
          <TabsContent value="vendas" className="w-full min-w-0 space-y-5">
            {/* Resumo Executivo de Vendas + Repasse Líquido */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 w-full min-w-0">
              <Card className="rounded-3xl border border-border bg-card p-4 space-y-1">
                <span className="text-[11px] text-muted-foreground font-semibold">Vendas Pagas no Período</span>
                <div className="text-xl font-black text-emerald-600">
                  R$ {Number(reportsData?.salesSummary?.totalPaidRevenue || settlement?.totalOrdersAmount || 0).toFixed(2)}
                </div>
                <span className="text-[10px] text-muted-foreground block">
                  {reportsData?.salesSummary?.totalOrdersPaid || settlement?.ordersCount || 0} pagamentos concluídos •{" "}
                  {reportsData?.salesSummary?.totalUnitsSold || 0} itens vendidos
                </span>
              </Card>

              <Card className="rounded-3xl border border-emerald-500/40 bg-emerald-500/10 p-4 space-y-1 shadow-xs">
                <span className="text-[11px] text-emerald-800 dark:text-emerald-300 font-bold uppercase tracking-wide">
                  Líquido a Receber (Repasse Anserve)
                </span>
                <div className="text-2xl font-black text-emerald-700 dark:text-emerald-300">
                  R$ {Number(settlement?.netPayableToAnserve || 0).toFixed(2)}
                </div>
                <span className="text-[10px] text-emerald-800/80 dark:text-emerald-300/80 block">
                  Já descontadas taxas (-R$ {Number(settlement?.totalFees || 0).toFixed(2)}) + cortesias (+R${" "}
                  {Number(settlement?.courtesyRestockCost || 0).toFixed(2)})
                </span>
              </Card>

              <Card className="rounded-3xl border border-border bg-card p-4 space-y-1">
                <span className="text-[11px] text-muted-foreground font-semibold">Lançamentos Aguardando Pagamento</span>
                <div className="text-xl font-black text-amber-600">
                  R$ {Number(reportsData?.salesSummary?.totalPendingRevenue || 0).toFixed(2)}
                </div>
                <span className="text-[10px] text-muted-foreground block">
                  {reportsData?.salesSummary?.totalOrdersPending || 0} estadias com saldo a quitar no check-out
                </span>
              </Card>

              <Card
                onClick={() => {
                  window.location.href = "/frigobar-notas";
                }}
                className="rounded-3xl border border-indigo-500/30 bg-indigo-500/5 hover:bg-indigo-500/10 cursor-pointer transition-all p-4 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-indigo-700 dark:text-indigo-300 font-bold">
                    Notas Fiscais Pendentes
                  </span>
                  <ArrowUpRight className="w-4 h-4 text-indigo-600" />
                </div>
                <div className="text-xl font-black text-indigo-600 dark:text-indigo-400">
                  {pendingOrders.length} {pendingOrders.length === 1 ? "pedido pago" : "pedidos pagos"}
                </div>
                <span className="text-[10px] text-indigo-600/80 dark:text-indigo-300/80 font-semibold block">
                  Clique para abrir a Central Exclusiva de NF →
                </span>
              </Card>
            </div>

            {/* Detalhamento do Fechamento de Repasse */}
            {settlement && (
              <Card className="rounded-3xl border border-border bg-muted/20 p-4 sm:p-5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs sm:text-sm font-black text-foreground flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-emerald-600" />
                      <span>Demonstrativo do Extrato de Repasse (CorpFlats ↔ Anserve)</span>
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      Cálculo automático: Total Pago − Taxas Gateway (Cartão 3,99% / PIX 0,99%) − Comissão CorpFlats + Reembolso de Cortesias Repostas
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 rounded-2xl bg-card border border-border">
                    <span className="text-[10px] text-muted-foreground block">1. Vendas Brutas Pagas</span>
                    <strong className="text-sm font-black text-foreground">
                      R$ {Number(settlement.totalOrdersAmount || 0).toFixed(2)}
                    </strong>
                    <span className="text-[10px] text-muted-foreground block mt-0.5">
                      PIX: R$ {Number(reportsData?.salesSummary?.byPaymentMethod?.pix || 0).toFixed(2)} • Cartão: R${" "}
                      {Number(reportsData?.salesSummary?.byPaymentMethod?.credit_card || 0).toFixed(2)}
                    </span>
                  </div>

                  <div className="p-3 rounded-2xl bg-card border border-border">
                    <span className="text-[10px] text-muted-foreground block">2. Taxas Cartão / PIX</span>
                    <strong className="text-sm font-black text-rose-600">
                      - R$ {Number(settlement.totalFees || (settlement.cardFees + settlement.pixFees) || 0).toFixed(2)}
                    </strong>
                    <span className="text-[10px] text-muted-foreground block mt-0.5">
                      Mercado Pago & PIX Inter
                    </span>
                  </div>

                  <div className="p-3 rounded-2xl bg-card border border-border">
                    <span className="text-[10px] text-muted-foreground block">3. Crédito de Cortesias</span>
                    <strong className="text-sm font-black text-sky-600">
                      + R$ {Number(settlement.courtesyRestockCost || 0).toFixed(2)}
                    </strong>
                    <span className="text-[10px] text-muted-foreground block mt-0.5">
                      Nespresso + Boas-vindas
                    </span>
                  </div>

                  <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
                    <span className="text-[10px] text-emerald-700 dark:text-emerald-300 font-bold block">
                      4. Saldo Líquido Anserve
                    </span>
                    <strong className="text-base font-black text-emerald-700 dark:text-emerald-300">
                      R$ {Number(settlement.netPayableToAnserve || 0).toFixed(2)}
                    </strong>
                    <span className="text-[10px] text-emerald-700/80 dark:text-emerald-300/80 block mt-0.5">
                      Valor final a transferir
                    </span>
                  </div>
                </div>
              </Card>
            )}

            {/* Barra de Filtros & Exportação CSV */}
            <Card className="rounded-3xl border border-border p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 w-full min-w-0">
              <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Filtrar pedido, flat, hóspede, item..."
                    value={salesSearch}
                    onChange={e => setSalesSearch(e.target.value)}
                    className="h-8 pl-9 text-xs rounded-xl"
                  />
                </div>

                <select
                  value={salesFlatFilter}
                  onChange={e => setSalesFlatFilter(e.target.value)}
                  className="h-8 text-xs rounded-xl border border-input bg-background px-2.5 font-bold flex-1 sm:flex-initial"
                >
                  <option value="todos">Todos os Flats</option>
                  {SOHO_FLATS.map(f => (
                    <option key={f} value={f}>
                      Flat {f}
                    </option>
                  ))}
                </select>

                <select
                  value={salesStatusFilter}
                  onChange={e => setSalesStatusFilter(e.target.value)}
                  className="h-8 text-xs rounded-xl border border-input bg-background px-2.5 font-bold flex-1 sm:flex-initial"
                >
                  <option value="todos">Todos os Status</option>
                  <option value="pago">Somente Pagos</option>
                  <option value="pendente">Somente Aguardando Pagamento</option>
                </select>
              </div>

              <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 w-full lg:w-auto">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleExportProductsCsv}
                  className="rounded-xl text-xs font-bold h-8 gap-1.5 w-full sm:w-auto"
                >
                  <Download className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Exportar Produtos (CSV)</span>
                </Button>
                <Button
                  size="sm"
                  onClick={handleExportSalesCsv}
                  className="rounded-xl text-xs font-bold h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white w-full sm:w-auto"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Exportar Vendas (CSV)</span>
                </Button>
              </div>
            </Card>

            {/* Saída por Produto */}
            {Array.isArray(reportsData?.salesSummary?.byProduct) &&
              reportsData.salesSummary.byProduct.length > 0 && (
                <Card className="rounded-3xl border border-border overflow-hidden w-full min-w-0">
                  <CardHeader className="p-4 border-b border-border bg-muted/20">
                    <CardTitle className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                      Resumo de Saída por Produto (Vendas Pagas no Período)
                    </CardTitle>
                  </CardHeader>
                  <div className="w-full overflow-x-auto">
                    <table className="w-full min-w-[460px] text-xs text-left">
                      <thead className="bg-muted/40 text-muted-foreground font-bold border-b border-border">
                        <tr>
                          <th className="p-3">Produto</th>
                          <th className="p-3">Categoria</th>
                          <th className="p-3 text-center">Qtd. Vendida</th>
                          <th className="p-3 text-right">Preço Venda</th>
                          <th className="p-3 text-right">Total Vendido</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {reportsData.salesSummary.byProduct.map((p: any) => (
                          <tr key={p.productId} className="hover:bg-muted/20">
                            <td className="p-3 font-bold text-foreground">{p.productName}</td>
                            <td className="p-3 text-muted-foreground">{p.category}</td>
                            <td className="p-3 text-center font-mono font-bold">{p.unitsSold} un.</td>
                            <td className="p-3 text-right font-mono">R$ {Number(p.unitPrice).toFixed(2)}</td>
                            <td className="p-3 text-right font-mono font-black text-emerald-600">
                              R$ {Number(p.totalRevenue).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

            {/* Listagem de Vendas e Lançamentos */}
            <Card className="rounded-3xl border border-border overflow-hidden w-full min-w-0">
              <CardHeader className="p-4 border-b border-border bg-card flex flex-row items-center justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="text-sm font-black text-foreground">
                    Listagem Detalhada de Vendas & Consumos
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Histórico de consumos lançados e pagamentos recebidos por flat
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-xs font-bold shrink-0">
                  {filteredReportOrders.length} registros
                </Badge>
              </CardHeader>

              <div className="w-full overflow-x-auto">
                <table className="w-full min-w-[680px] text-xs text-left">
                  <thead className="bg-muted/40 text-muted-foreground font-bold border-b border-border">
                    <tr>
                      <th className="p-3.5">Pedido / Data</th>
                      <th className="p-3.5">Flat</th>
                      <th className="p-3.5">Hóspede</th>
                      <th className="p-3.5">Itens Consumidos</th>
                      <th className="p-3.5">Pagamento</th>
                      <th className="p-3.5">Nota Fiscal</th>
                      <th className="p-3.5 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredReportOrders.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-muted-foreground">
                          Nenhuma venda encontrada para os filtros selecionados.
                        </td>
                      </tr>
                    ) : (
                      filteredReportOrders.map((o: any) => (
                        <tr key={o.id} className="hover:bg-muted/20">
                          <td className="p-3.5">
                            <div className="font-mono font-bold text-primary">{o.id}</div>
                            <div className="text-[10px] text-muted-foreground">
                              {o.date ? new Date(o.date).toLocaleString("pt-BR") : "-"}
                            </div>
                          </td>
                          <td className="p-3.5">
                            <Badge variant="outline" className="font-bold">
                              Flat {o.flatNumber}
                            </Badge>
                          </td>
                          <td className="p-3.5">
                            <div className="font-bold text-foreground">{o.guestName}</div>
                            <div className="text-[10px] font-mono text-muted-foreground">
                              {o.reservationCode}
                            </div>
                          </td>
                          <td className="p-3.5 max-w-xs truncate" title={o.itemsSummary}>
                            {o.itemsSummary}
                          </td>
                          <td className="p-3.5">
                            <Badge
                              className={
                                o.paymentStatus === "pago"
                                  ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 text-[10px]"
                                  : "bg-amber-500/15 text-amber-700 border-amber-500/30 text-[10px]"
                              }
                            >
                              {o.paymentStatus === "pago" ? "✓ Pago" : "Aguardando"} (
                              {o.paymentMethod === "pix"
                                ? "PIX"
                                : o.paymentMethod === "credit_card"
                                ? "Cartão"
                                : "Pós-Checkout"}
                              )
                            </Badge>
                          </td>
                          <td className="p-3.5">
                            {o.invoiceStatus === "anexada" ? (
                              <Badge className="bg-sky-500/15 text-sky-700 border-sky-500/30 text-[10px]">
                                Emitida {o.invoiceNumber ? `#${o.invoiceNumber}` : ""}
                              </Badge>
                            ) : o.paymentStatus === "pago" ? (
                              <button
                                type="button"
                                onClick={() => {
                                  window.location.href = "/frigobar-notas";
                                }}
                                className="text-[11px] font-bold text-indigo-600 hover:underline flex items-center gap-1"
                              >
                                <FileText className="w-3 h-3" />
                                Emitir NF →
                              </button>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">Após pagamento</span>
                            )}
                          </td>
                          <td className="p-3.5 text-right font-mono font-black text-foreground">
                            R$ {Number(o.totalAmount || 0).toFixed(2)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          {/* ABA 2: EQUIPE & WHATSAPP DE TRABALHO */}
          <TabsContent value="equipe" className="w-full min-w-0 space-y-5">
            {/* Bloco A: Gestão da Equipe Anserve */}
            <div className="bg-card border border-border p-4 sm:p-5 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full min-w-0">
              <div className="space-y-1 min-w-0">
                <h3 className="text-sm sm:text-base font-black text-foreground flex items-center gap-2">
                  <Users className="w-5 h-5 text-teal-600 shrink-0" />
                  <span>Equipe Anserve (Repositoras & Emissão de NF)</span>
                </h3>
                <p className="text-xs text-muted-foreground">
                  Cadastre colaboradoras, escolha a função (Repositora nos Flats ou Emissão de NF), redefina senhas/PINs e envie o acesso automaticamente por WhatsApp.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 shrink-0 w-full sm:w-auto">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleExportProductivityCsv}
                  className="rounded-xl text-xs font-bold h-9 gap-1.5 w-full sm:w-auto"
                >
                  <Download className="w-3.5 h-3.5 text-teal-600" />
                  <span>Exportar Produtividade (CSV)</span>
                </Button>
                <Button
                  size="sm"
                  onClick={handleOpenCreateStaff}
                  className="rounded-xl text-xs font-bold h-9 gap-1.5 bg-teal-600 hover:bg-teal-700 text-white w-full sm:w-auto"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Nova Colaboradora</span>
                </Button>
              </div>
            </div>

            {/* Tabela Limpa de Colaboradoras (Sem colunas antigas de divergência) */}
            <Card className="rounded-3xl border border-border overflow-hidden w-full min-w-0">
              <CardHeader className="p-4 border-b border-border bg-card">
                <CardTitle className="text-sm font-black text-foreground flex items-center gap-2">
                  <Award className="w-4 h-4 text-teal-600 shrink-0" />
                  <span>Quadro de Colaboradoras & Produtividade no Período</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Acompanhe os flats atendidos, itens lançados/repostos e gerencie credenciais em 1 clique
                </CardDescription>
              </CardHeader>

              <div className="w-full overflow-x-auto">
                <table className="w-full min-w-[700px] text-xs text-left">
                  <thead className="bg-muted/40 text-muted-foreground font-bold border-b border-border">
                    <tr>
                      <th className="p-3.5">Colaboradora</th>
                      <th className="p-3.5">Função</th>
                      <th className="p-3.5">WhatsApp & PIN</th>
                      <th className="p-3.5 text-center">Status</th>
                      <th className="p-3.5 text-center">Passagens nos Flats</th>
                      <th className="p-3.5 text-center">Itens Repostos</th>
                      <th className="p-3.5">Última Passagem</th>
                      <th className="p-3.5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {staffList.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-muted-foreground">
                          Nenhuma colaboradora cadastrada ainda. Clique em "Nova Colaboradora" para adicionar.
                        </td>
                      </tr>
                    ) : (
                      staffList.map(member => {
                        const p = member.productivity;
                        const cleanPh = (member.whatsapp || member.phone || "").replace(/\D/g, "");
                        return (
                          <tr key={member.id} className="hover:bg-muted/20 transition-colors">
                            <td className="p-3.5">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-xl bg-teal-500/10 text-teal-700 dark:text-teal-300 font-black flex items-center justify-center">
                                  {(member.name || member.username).substring(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <div className="font-bold text-foreground">{member.name}</div>
                                  <div className="text-[10px] font-mono text-muted-foreground">
                                    @{member.username}
                                  </div>
                                </div>
                              </div>
                            </td>

                            <td className="p-3.5">
                              {member.role === "anserve_faturamento" ? (
                                <Badge className="bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30 text-[10px] font-bold">
                                  📄 Emissão de NF
                                </Badge>
                              ) : (
                                <Badge className="bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30 text-[10px] font-bold">
                                  🧹 Repositora
                                </Badge>
                              )}
                            </td>

                            <td className="p-3.5">
                              <div className="space-y-0.5">
                                {cleanPh ? (
                                  <a
                                    href={`https://wa.me/${cleanPh.startsWith("55") ? cleanPh : "55" + cleanPh}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-mono text-emerald-600 hover:underline flex items-center gap-1 font-semibold"
                                  >
                                    <Phone className="w-3 h-3" />
                                    {member.whatsapp}
                                  </a>
                                ) : (
                                  <span className="text-muted-foreground">Sem WhatsApp</span>
                                )}
                                {member.role !== "anserve_faturamento" && (
                                  <div className="text-[10px] text-muted-foreground">
                                    PIN Mobile:{" "}
                                    <strong className="font-mono text-foreground">
                                      {member.pin || "1234 (Padrão)"}
                                    </strong>
                                  </div>
                                )}
                              </div>
                            </td>

                            <td className="p-3.5 text-center">
                              {member.active !== false ? (
                                <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 text-[10px]">
                                  Ativa
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-[10px]">
                                  Inativa
                                </Badge>
                              )}
                            </td>

                            <td className="p-3.5 text-center">
                              <div className="font-black text-sm text-foreground">
                                {p?.inspectionsCount || 0}
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                {p?.flatsVisitedCount || 0} flats atendidos
                              </div>
                            </td>

                            <td className="p-3.5 text-center">
                              <div className="font-bold text-sky-600">
                                {p?.totalItemsRestockedQty || 0} un.
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                {p?.paidItemsRestockedQty || 0} pagos • {p?.courtesyItemsRestockedQty || 0} cort.
                              </div>
                            </td>

                            <td className="p-3.5 text-[11px] text-muted-foreground">
                              {p?.lastInspectionAt
                                ? new Date(p.lastInspectionAt).toLocaleString("pt-BR")
                                : "Nenhuma no período"}
                            </td>

                            <td className="p-3.5 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setHistoryModalStaff(member)}
                                  title="Ver histórico de passagens desta colaboradora"
                                  className="h-7 px-2 rounded-lg text-[11px] font-bold text-teal-600"
                                >
                                  <Eye className="w-3.5 h-3.5 mr-1" />
                                  Histórico
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => handleOpenEditStaff(member)}
                                  title="Editar cadastro"
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
                                  title="Resetar Senha ou PIN"
                                  className="h-7 w-7 rounded-lg text-amber-600"
                                >
                                  <Key className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => handleDeleteStaff(member)}
                                  title="Excluir colaboradora"
                                  className="h-7 w-7 rounded-lg text-rose-600"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Bloco B: WhatsApp Exclusivo de Trabalho das Repositoras */}
            <Card className="rounded-3xl border border-teal-500/30 bg-teal-500/5 p-4 sm:p-5 space-y-4 w-full min-w-0">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Phone className="w-4 h-4 text-teal-600 shrink-0" />
                    <h4 className="text-xs sm:text-sm font-black text-foreground">
                      Celular de Trabalho das Repositoras (Avisos Automáticos de Check-out)
                    </h4>
                    <Badge className="bg-teal-600 text-white text-[10px]">WhatsApp Dedicado</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Este número recebe o resumo de check-outs no <strong>1º login do dia</strong> e um aviso imediato <strong>sempre que um hóspede faz check-out</strong>, evitando mensagens no celular particular das funcionárias.
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
                    {savingWorkWhatsapp ? "Salvando..." : "Salvar Número"}
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

          {/* ABA 3: HISTÓRICO DE LANÇAMENTOS DIÁRIOS & PASSAGENS NOS FLATS */}
          <TabsContent value="estoque" className="w-full min-w-0 space-y-4">
            <Card className="rounded-3xl border border-border overflow-hidden w-full min-w-0">
              <CardHeader className="p-4 border-b border-border bg-card flex flex-row items-center justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="text-sm font-black text-foreground">
                    Histórico de Passagens Diárias & Lançamentos nos Flats
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Registro de todas as conferências diárias e finais pós-checkout feitas pelas repositoras no período
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-xs font-bold shrink-0">
                  {(reportsData?.productivitySummary?.inspections || []).length} passagens
                </Badge>
              </CardHeader>

              <div className="w-full overflow-x-auto">
                <table className="w-full min-w-[640px] text-xs text-left">
                  <thead className="bg-muted/40 text-muted-foreground font-bold border-b border-border">
                    <tr>
                      <th className="p-3.5">Data / Hora</th>
                      <th className="p-3.5">Flat</th>
                      <th className="p-3.5">Repositora</th>
                      <th className="p-3.5">Resultado da Passagem</th>
                      <th className="p-3.5">Itens Lançados / Repostos</th>
                      <th className="p-3.5">Observações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(reportsData?.productivitySummary?.inspections || []).length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-muted-foreground">
                          Nenhuma passagem registrada no período selecionado.
                        </td>
                      </tr>
                    ) : (
                      (reportsData?.productivitySummary?.inspections || []).map((insp: any) => {
                        const launchedVal = Number(insp.discrepancyTotalAmount || 0);
                        return (
                          <tr key={insp.id} className="hover:bg-muted/20">
                            <td className="p-3.5 font-mono text-[11px]">
                              {insp.inspectedAt ? new Date(insp.inspectedAt).toLocaleString("pt-BR") : "-"}
                            </td>
                            <td className="p-3.5">
                              <Badge variant="outline" className="font-bold">
                                Flat {insp.flatNumber}
                              </Badge>
                            </td>
                            <td className="p-3.5 font-bold text-foreground">
                              {insp.inspectorName || "Repositora Anserve"}
                            </td>
                            <td className="p-3.5">
                              {launchedVal > 0 || insp.status === "lancamento_diario" ? (
                                <Badge className="bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30 text-[10px]">
                                  Consumo Lançado {launchedVal > 0 ? `(R$ ${launchedVal.toFixed(2)})` : ""}
                                </Badge>
                              ) : (
                                <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 text-[10px]">
                                  ✓ Passagem Sem Consumo
                                </Badge>
                              )}
                            </td>
                            <td className="p-3.5">
                              {(insp.restockedItems || []).length > 0
                                ? (insp.restockedItems || [])
                                    .map((it: any) => `${it.quantity}x ${it.productName || it.productId}`)
                                    .join(", ")
                                : "Sem reposição"}
                            </td>
                            <td className="p-3.5 text-muted-foreground max-w-xs truncate">
                              {insp.notes || "-"}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Modal: Criar / Editar Funcionária Anserve */}
        <Dialog open={staffModalOpen} onOpenChange={setStaffModalOpen}>
          <DialogContent className="sm:max-w-md rounded-3xl p-6">
            <DialogHeader>
              <DialogTitle className="text-base font-black flex items-center gap-2">
                <Users className="w-5 h-5 text-teal-600" />
                <span>{editingStaff ? "Editar Funcionária" : "Cadastrar Nova Funcionária"}</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                As funcionárias cadastradas terão acesso ao aplicativo mobile de conferência e reposição de frigobar.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveStaff} className="space-y-3.5 py-2 text-xs">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Função na Equipe *</Label>
                <select
                  value={sRole}
                  onChange={e => setSRole(e.target.value as any)}
                  className="w-full h-9 rounded-xl border border-border bg-background px-3 text-xs font-semibold"
                >
                  <option value="anserve_repositora">🧹 Repositora / Conferência nos Flats (/frigobar-reposicao)</option>
                  <option value="anserve_faturamento">📄 Emissão de Notas Fiscais (/frigobar-notas)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Nome Completo *</Label>
                <Input
                  required
                  placeholder="ex: Maria Silva"
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
                    placeholder="ex: maria.anserve"
                    value={sUsername}
                    onChange={e => setSUsername(e.target.value)}
                    className="h-9 text-xs rounded-xl font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">PIN Rápido (4 dígitos)</Label>
                  <Input
                    placeholder="ex: 4580"
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
                  <Label className="text-xs font-bold">WhatsApp / Celular</Label>
                  <Input
                    placeholder="ex: 22999999999"
                    value={sWhatsapp}
                    onChange={e => setSWhatsapp(e.target.value)}
                    className="h-9 text-xs rounded-xl font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Chave PIX (Opcional)</Label>
                  <Input
                    placeholder="CPF, celular ou e-mail"
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
                    Ao criar a funcionária com o número de WhatsApp preenchido acima, o sistema envia automaticamente uma mensagem com o link direto de acesso, login (@usuário), senha inicial e PIN!
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between p-3 rounded-2xl bg-muted/40 border border-border">
                <div>
                  <span className="font-bold text-foreground block">Cadastro Ativo</span>
                  <span className="text-[10px] text-muted-foreground">
                    Permite que a funcionária faça login e lance conferências
                  </span>
                </div>
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
                <Button
                  type="submit"
                  disabled={savingStaff}
                  className="rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white"
                >
                  {savingStaff ? "Salvando..." : editingStaff ? "Salvar Alterações" : "Criar Funcionária"}
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
              <DialogDescription className="text-xs">
                Defina uma nova senha de login e/ou um novo PIN numérico para acesso rápido pelo celular.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleResetStaffCredentials} className="space-y-4 py-2 text-xs">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Nova Senha (deixe em branco para manter a atual)</Label>
                <Input
                  type="text"
                  placeholder="Digite a nova senha (mín. 4 caracteres)"
                  value={resetPasswordInput}
                  onChange={e => setResetPasswordInput(e.target.value)}
                  className="h-9 text-xs rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">PIN de Acesso Mobile (4 dígitos)</Label>
                <Input
                  type="text"
                  maxLength={6}
                  placeholder="ex: 4580"
                  value={resetPinInput}
                  onChange={e => setResetPinInput(e.target.value.replace(/\D/g, ""))}
                  className="h-9 text-xs rounded-xl font-mono"
                />
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setResetModalStaff(null)}
                  className="rounded-xl text-xs font-bold"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={savingReset}
                  className="rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {savingReset ? "Atualizando..." : "Salvar Nova Senha / PIN"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Modal: Relatório Individual de Passagens da Funcionária */}
        <Dialog open={Boolean(historyModalStaff)} onOpenChange={() => setHistoryModalStaff(null)}>
          <DialogContent className="sm:max-w-2xl rounded-3xl p-6 max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base font-black flex items-center gap-2">
                <Award className="w-5 h-5 text-teal-600" />
                <span>Histórico Individual — {historyModalStaff?.name}</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                Histórico de passagens diárias, lançamentos e reposições feitas por @{historyModalStaff?.username} no período.
              </DialogDescription>
            </DialogHeader>

            {historyModalStaff && (
              <div className="space-y-4 py-2 text-xs">
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-2xl bg-muted/40 border border-border">
                    <span className="text-[10px] text-muted-foreground block">Passagens Realizadas</span>
                    <strong className="text-base font-black">
                      {historyModalStaff.productivity?.inspectionsCount || 0}
                    </strong>
                  </div>
                  <div className="p-3 rounded-2xl bg-muted/40 border border-border">
                    <span className="text-[10px] text-muted-foreground block">Flats Atendidos</span>
                    <strong className="text-base font-black">
                      {historyModalStaff.productivity?.flatsVisitedCount || 0}
                    </strong>
                  </div>
                  <div className="p-3 rounded-2xl bg-muted/40 border border-border">
                    <span className="text-[10px] text-muted-foreground block">Itens Repostos</span>
                    <strong className="text-base font-black text-sky-600">
                      {historyModalStaff.productivity?.totalItemsRestockedQty || 0} un.
                    </strong>
                  </div>
                </div>

                <div className="border border-border rounded-2xl overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted/40 text-muted-foreground font-bold border-b border-border">
                      <tr>
                        <th className="p-2.5">Data/Hora</th>
                        <th className="p-2.5">Flat</th>
                        <th className="p-2.5">Resultado</th>
                        <th className="p-2.5">Itens Lançados / Repostos</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(historyModalStaff.productivity?.recentInspections || []).length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-6 text-center text-muted-foreground">
                            Nenhuma passagem registrada para esta colaboradora no período selecionado.
                          </td>
                        </tr>
                      ) : (
                        (historyModalStaff.productivity?.recentInspections || []).map((insp: any) => {
                          const launchedVal = Number(insp.discrepancyTotalAmount || 0);
                          return (
                            <tr key={insp.id}>
                              <td className="p-2.5 font-mono text-[11px]">
                                {insp.inspectedAt ? new Date(insp.inspectedAt).toLocaleString("pt-BR") : "-"}
                              </td>
                              <td className="p-2.5 font-bold">Flat {insp.flatNumber}</td>
                              <td className="p-2.5">
                                {launchedVal > 0 || insp.status === "lancamento_diario" ? (
                                  <Badge className="bg-sky-500/15 text-sky-700 text-[10px]">
                                    Consumo Lançado {launchedVal > 0 ? `(R$ ${launchedVal.toFixed(2)})` : ""}
                                  </Badge>
                                ) : (
                                  <Badge className="bg-emerald-500/15 text-emerald-700 text-[10px]">
                                    ✓ Sem Consumo
                                  </Badge>
                                )}
                              </td>
                              <td className="p-2.5">
                                {(insp.restockedItems || [])
                                  .map((it: any) => `${it.quantity}x ${it.productName || it.productId}`)
                                  .join(", ") || "-"}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setHistoryModalStaff(null)}
                className="rounded-xl text-xs font-bold"
              >
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal: Anexar Nota Fiscal */}
        <Dialog open={Boolean(selectedOrderForInvoice)} onOpenChange={() => setSelectedOrderForInvoice(null)}>
          <DialogContent className="sm:max-w-lg rounded-3xl p-6">
            <DialogHeader>
              <DialogTitle className="text-base font-black flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-primary" />
                <span>Anexar Nota Fiscal — Pedido {selectedOrderForInvoice?.id}</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                Ao anexar a Nota Fiscal emitida, o sistema enviará automaticamente via WhatsApp e E-mail para o cliente.
              </DialogDescription>
            </DialogHeader>

            {selectedOrderForInvoice && (
              <div className="space-y-4 py-2 text-xs">
                <div className="p-3 rounded-2xl bg-muted/40 border border-border space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Flat / Reserva:</span>
                    <strong className="text-foreground">
                      Flat {selectedOrderForInvoice.flatNumber} ({selectedOrderForInvoice.reservationCode})
                    </strong>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Hóspede:</span>
                    <strong className="text-foreground">{selectedOrderForInvoice.guestName}</strong>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Documento p/ NF:</span>
                    <strong className="font-mono text-foreground">
                      {selectedOrderForInvoice.fiscalPreferences?.documentNumber ||
                        selectedOrderForInvoice.guestDocument ||
                        "Não informado"}
                    </strong>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">E-mail de Envio:</span>
                    <span className="font-mono text-foreground truncate max-w-[200px]">
                      {selectedOrderForInvoice.fiscalPreferences?.email || selectedOrderForInvoice.guestEmail}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-border">
                    <span className="text-muted-foreground">Discriminação Escolhida:</span>
                    {renderPreferenceBadge(selectedOrderForInvoice.fiscalPreferences?.invoiceDescriptionType)}
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-border">
                    <span className="text-muted-foreground">Valor Total:</span>
                    <strong className="text-sm font-black text-emerald-600">
                      R$ {Number(selectedOrderForInvoice.totalAmount).toFixed(2)}
                    </strong>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Número da Nota Fiscal (NFS-e / DANFE)</Label>
                  <Input
                    placeholder="ex: 1042"
                    value={invoiceNumberInput}
                    onChange={e => setInvoiceNumberInput(e.target.value)}
                    className="h-9 text-xs rounded-xl font-mono"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold">Arquivo da Nota Fiscal (PDF ou Foto)</Label>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="p-4 rounded-2xl border-2 border-dashed border-border hover:border-primary/50 transition-all cursor-pointer text-center space-y-1 bg-muted/20"
                  >
                    <Upload className="w-6 h-6 text-muted-foreground mx-auto" />
                    {invoiceFileName ? (
                      <div className="text-xs font-bold text-primary truncate max-w-xs mx-auto">
                        {invoiceFileName}
                      </div>
                    ) : (
                      <>
                        <div className="text-xs font-semibold text-foreground">
                          Clique para selecionar o PDF ou foto
                        </div>
                        <div className="text-[10px] text-muted-foreground">Formatos suportados: PDF, PNG, JPG</div>
                      </>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf,image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>

                <div className="p-3 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-800 dark:text-sky-300 text-[11px] space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5" />
                    <span>Disparo Automático Ativo</span>
                  </div>
                  <div>
                    Ao clicar em confirmar, o documento será disparado para o WhatsApp (
                    {selectedOrderForInvoice.guestPhone || "cadastrado"}) e enviado para o e-mail (
                    {selectedOrderForInvoice.fiscalPreferences?.email || selectedOrderForInvoice.guestEmail}).
                  </div>
                </div>
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button
                variant="outline"
                onClick={() => setSelectedOrderForInvoice(null)}
                className="rounded-xl text-xs font-bold"
              >
                Cancelar
              </Button>
              <Button
                disabled={uploadingInvoice || !invoiceFileData}
                onClick={handleUploadInvoice}
                className="rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {uploadingInvoice ? "Enviando e Disparando..." : "Anexar e Disparar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal: Corrigir Contato / Reenviar Nota Fiscal */}
        <Dialog open={Boolean(retryModalOrder)} onOpenChange={() => setRetryModalOrder(null)}>
          <DialogContent className="sm:max-w-md rounded-3xl p-6">
            <DialogHeader>
              <DialogTitle className="text-base font-black flex items-center gap-2">
                <Send className="w-5 h-5 text-primary" />
                <span>Reenviar Nota Fiscal — {retryModalOrder?.id}</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                Corrija o WhatsApp ou E-mail do hóspede ({retryModalOrder?.guestName}) e reenvie a Nota Fiscal imediatamente.
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
    </Shell>
  );
}
