import React, { useState, useEffect, useMemo, useRef } from "react";
import { Shell } from "@/components/layout";
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

  const [activeTab, setActiveTab] = useState<"nfs" | "vendas" | "equipe" | "estoque" | "extrato">("nfs");

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
        role: "anserve_repositora",
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
      "Funcionária",
      "Login",
      "Status",
      "WhatsApp",
      "PIN Mobile",
      "Total Vistorias",
      "Vistorias Conformes",
      "Divergências Apontadas",
      "Taxa Conformidade (%)",
      "Flats Atendidos",
      "Unidades Pagas Repostas",
      "Cortesias Repostas",
      "Total Itens Repostos",
      "Divergências Detectadas (R$)",
      "Divergências Recuperadas (R$)",
      "Última Conferência"
    ];
    const rows = staffList.map(st => {
      const p = st.productivity;
      return [
        st.name,
        `@${st.username}`,
        st.active ? "Ativa" : "Inativa",
        st.whatsapp || "-",
        st.pin || "Padrão",
        p?.inspectionsCount || 0,
        p?.conformeCount || 0,
        p?.discrepancyCount || 0,
        String(p?.conformityRatePct ?? 100).replace(".", ","),
        p?.flatsVisitedCount || 0,
        p?.paidItemsRestockedQty || 0,
        p?.courtesyItemsRestockedQty || 0,
        p?.totalItemsRestockedQty || 0,
        Number(p?.discrepancyAmountDetected || 0).toFixed(2).replace(".", ","),
        Number(p?.discrepancyAmountRecovered || 0).toFixed(2).replace(".", ","),
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
      <div className="w-full max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-3 sm:py-4 md:py-6 space-y-4 sm:space-y-6 pb-28 min-w-0 overflow-x-hidden">
        {/* Header */}
        <div className="w-full min-w-0 bg-card border border-border p-4 sm:p-6 rounded-3xl shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-xl md:text-2xl font-black text-foreground leading-tight break-words">
                  Painel de Gestão & Supervisão Anserve
                </h1>
                <Badge className="bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30 text-[10px] font-bold">
                  Operação & Equipe
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Fila de Notas Fiscais, relatório de vendas com exportação CSV, gestão de funcionárias de reposição e extrato de repasse.
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

        {/* Tabs Control */}
        <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="w-full min-w-0 space-y-4">
          <TabsList className="w-full bg-muted/50 p-1.5 rounded-2xl border border-border grid grid-cols-2 sm:flex sm:flex-wrap h-auto gap-1.5">
            <TabsTrigger value="nfs" className="rounded-xl text-[11px] sm:text-xs font-bold px-2.5 sm:px-3.5 py-2 flex items-center justify-center gap-1.5 w-full sm:w-auto min-w-0">
              <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="truncate">Notas Fiscais</span>
              {pendingOrders.length > 0 && (
                <span className="bg-amber-500 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full shrink-0">
                  {pendingOrders.length}
                </span>
              )}
            </TabsTrigger>

            <TabsTrigger value="vendas" className="rounded-xl text-[11px] sm:text-xs font-bold px-2.5 sm:px-3.5 py-2 flex items-center justify-center gap-1.5 w-full sm:w-auto min-w-0">
              <BarChart3 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span className="truncate">Vendas (CSV)</span>
            </TabsTrigger>

            <TabsTrigger value="equipe" className="rounded-xl text-[11px] sm:text-xs font-bold px-2.5 sm:px-3.5 py-2 flex items-center justify-center gap-1.5 w-full sm:w-auto min-w-0">
              <Users className="w-3.5 h-3.5 text-teal-600 shrink-0" />
              <span className="truncate">Funcionárias</span>
              <Badge variant="secondary" className="text-[10px] py-0 px-1.5 shrink-0">
                {staffList.length}
              </Badge>
            </TabsTrigger>

            <TabsTrigger value="estoque" className="rounded-xl text-[11px] sm:text-xs font-bold px-2.5 sm:px-3.5 py-2 flex items-center justify-center gap-1.5 w-full sm:w-auto min-w-0">
              <Package className="w-3.5 h-3.5 text-sky-600 shrink-0" />
              <span className="truncate">Conferências</span>
            </TabsTrigger>

            <TabsTrigger value="extrato" className="rounded-xl text-[11px] sm:text-xs font-bold px-2.5 sm:px-3.5 py-2 flex items-center justify-center gap-1.5 w-full sm:w-auto min-w-0 col-span-2 sm:col-span-1">
              <DollarSign className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="truncate">Extrato de Repasse</span>
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: FILA DE NOTAS FISCAIS PENDENTES & MONITOR DE ENTREGA */}
          <TabsContent value="nfs" className="w-full min-w-0 space-y-4">
            {/* Monitoramento de Entrega de Notas Fiscais (WhatsApp + E-mail) */}
            {deliveryMonitor && (
              <Card
                className={`rounded-3xl border p-4 sm:p-5 space-y-3 ${
                  (deliveryMonitor.failedInvoices?.length || 0) > 0
                    ? "border-rose-500/50 bg-rose-500/5"
                    : "border-emerald-500/30 bg-emerald-500/5"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    {(deliveryMonitor.failedInvoices?.length || 0) > 0 ? (
                      <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    )}
                    <div>
                      <h4 className="text-xs sm:text-sm font-black text-foreground">
                        Monitor de Envio de Notas Fiscais (WhatsApp + E-mail)
                      </h4>
                      <p className="text-[11px] text-muted-foreground">
                        O sistema monitora automaticamente cada envio, tenta novamente em caso de falha e alerta para correção ou reenvio manual.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 font-bold">
                      ✅ {deliveryMonitor.summary?.fullyDeliveredCount || 0} Entregues
                    </Badge>
                    {(deliveryMonitor.summary?.retryingCount || 0) > 0 && (
                      <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30 font-bold">
                        🔄 {deliveryMonitor.summary?.retryingCount} Retentando
                      </Badge>
                    )}
                    {(deliveryMonitor.summary?.failedCount || 0) > 0 && (
                      <Badge className="bg-rose-500/15 text-rose-700 border-rose-500/30 font-bold">
                        ⚠️ {deliveryMonitor.summary?.failedCount} Com Falha
                      </Badge>
                    )}
                  </div>
                </div>

                {(deliveryMonitor.failedInvoices?.length > 0 || deliveryMonitor.retryingInvoices?.length > 0) && (
                  <div className="space-y-2 pt-2 border-t border-border/60">
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
                )}
              </Card>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <h3 className="text-sm font-bold text-foreground">Pedidos Quitados Aguardando Nota Fiscal</h3>
                <p className="text-xs text-muted-foreground">
                  Anexe o arquivo (PDF ou foto) da NF. O sistema enviará automaticamente via WhatsApp e E-mail.
                </p>
              </div>

              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por flat, hóspede ou CPF..."
                  value={invoiceSearch}
                  onChange={e => setInvoiceSearch(e.target.value)}
                  className="h-8 pl-9 text-xs rounded-xl"
                />
              </div>
            </div>

            {loading ? (
              <div className="h-64 bg-card border border-border rounded-3xl animate-pulse" />
            ) : filteredOrders.length === 0 ? (
              <div className="bg-card border border-border rounded-3xl p-10 text-center space-y-3">
                <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
                <h3 className="text-sm font-bold text-foreground">Fila de Notas Fiscais em dia!</h3>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  Não há pedidos de consumo de frigobar pendentes de anexo de nota fiscal no momento.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {filteredOrders.map(ord => {
                  const docNumber = ord.fiscalPreferences?.documentNumber || ord.guestDocument || "Não informado";
                  const destEmail = ord.fiscalPreferences?.email || ord.guestEmail || "Sem e-mail cadastrado";
                  const prefType = ord.fiscalPreferences?.invoiceDescriptionType || "detailed";
                  const companyName = ord.fiscalPreferences?.companyName;

                  return (
                    <Card
                      key={ord.id}
                      className="rounded-3xl border border-border bg-card hover:border-border/80 transition-all shadow-xs"
                    >
                      <CardContent className="p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-2 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-bold text-primary">{ord.id}</span>
                            <Badge variant="outline" className="text-[11px] font-bold">
                              Flat {ord.flatNumber}
                            </Badge>
                            <Badge variant="secondary" className="text-[10px] font-mono">
                              {ord.reservationCode}
                            </Badge>
                            {renderPreferenceBadge(prefType)}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-xs pt-1">
                            <div>
                              <span className="text-muted-foreground block text-[10px]">Hóspede:</span>
                              <strong className="text-foreground">{ord.guestName}</strong>
                              {companyName && (
                                <span className="block text-[11px] text-muted-foreground truncate">
                                  {companyName}
                                </span>
                              )}
                            </div>

                            <div>
                              <span className="text-muted-foreground block text-[10px]">Documento p/ Emissão:</span>
                              <strong className="font-mono text-foreground">{docNumber}</strong>
                              <span className="block text-[11px] text-muted-foreground truncate">{destEmail}</span>
                            </div>

                            <div>
                              <span className="text-muted-foreground block text-[10px]">Itens Consumidos:</span>
                              <span className="text-foreground truncate block">
                                {ord.items.map(it => `${it.quantity}x ${it.productName || it.productId}`).join(", ")}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between md:flex-col md:items-end gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-border">
                          <div className="text-left md:text-right">
                            <span className="text-[10px] text-muted-foreground block">Valor Total Pago:</span>
                            <span className="text-base font-black text-emerald-600 dark:text-emerald-400">
                              R$ {Number(ord.totalAmount).toFixed(2)}
                            </span>
                          </div>

                          <Button
                            size="sm"
                            onClick={() => {
                              setSelectedOrderForInvoice(ord);
                              setInvoiceFileData(null);
                              setInvoiceFileName("");
                              setInvoiceNumberInput("");
                            }}
                            className="rounded-2xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4"
                          >
                            <Upload className="w-3.5 h-3.5 mr-1.5" />
                            Anexar Nota Fiscal
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* TAB 2: RELATÓRIO RESUMIDO DE VENDAS & EXPORTAÇÃO CSV */}
          <TabsContent value="vendas" className="w-full min-w-0 space-y-5">
            {/* Summary KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 w-full min-w-0">
              <Card className="rounded-3xl border border-border bg-card p-3.5 sm:p-4 space-y-1 min-w-0">
                <span className="text-[11px] text-muted-foreground font-semibold">Vendas Pagas no Período</span>
                <div className="text-lg sm:text-xl font-black text-emerald-600">
                  R$ {Number(reportsData?.salesSummary?.totalPaidRevenue || 0).toFixed(2)}
                </div>
                <span className="text-[10px] text-muted-foreground block">
                  {reportsData?.salesSummary?.totalOrdersPaid || 0} pedidos pagos
                </span>
              </Card>

              <Card className="rounded-3xl border border-border bg-card p-3.5 sm:p-4 space-y-1 min-w-0">
                <span className="text-[11px] text-muted-foreground font-semibold">Unidades Vendidas</span>
                <div className="text-lg sm:text-xl font-black text-foreground">
                  {reportsData?.salesSummary?.totalUnitsSold || 0} un.
                </div>
                <span className="text-[10px] text-muted-foreground block">
                  Ticket médio: R$ {Number(reportsData?.salesSummary?.averageTicket || 0).toFixed(2)}
                </span>
              </Card>

              <Card className="rounded-3xl border border-border bg-card p-3.5 sm:p-4 space-y-1 min-w-0">
                <span className="text-[11px] text-muted-foreground font-semibold">PIX vs. Cartão</span>
                <div className="text-xs sm:text-sm font-black text-foreground pt-1">
                  PIX: R$ {Number(reportsData?.salesSummary?.byPaymentMethod?.pix || 0).toFixed(2)}
                </div>
                <span className="text-[10px] sm:text-[11px] text-muted-foreground block font-semibold">
                  Cartão: R$ {Number(reportsData?.salesSummary?.byPaymentMethod?.credit_card || 0).toFixed(2)}
                </span>
              </Card>

              <Card className="rounded-3xl border border-border bg-card p-3.5 sm:p-4 space-y-1 min-w-0">
                <span className="text-[11px] text-muted-foreground font-semibold">Divergências em Aberto</span>
                <div className="text-lg sm:text-xl font-black text-amber-600">
                  R$ {Number(reportsData?.salesSummary?.totalPendingRevenue || 0).toFixed(2)}
                </div>
                <span className="text-[10px] text-muted-foreground block">
                  {reportsData?.salesSummary?.totalOrdersPending || 0} aguardando pagamento
                </span>
              </Card>
            </div>

            {/* Filters & CSV Export Bar */}
            <Card className="rounded-3xl border border-border p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 w-full min-w-0">
              <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Filtrar pedido, flat, item..."
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
                  <option value="pendente">Somente Pendentes</option>
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

            {/* Sales Summary by Product */}
            {Array.isArray(reportsData?.salesSummary?.byProduct) &&
              reportsData.salesSummary.byProduct.length > 0 && (
                <Card className="rounded-3xl border border-border overflow-hidden w-full min-w-0">
                  <CardHeader className="p-4 border-b border-border bg-muted/20">
                    <CardTitle className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                      Resumo de Saída por Produto (Vendas Pagas)
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

            {/* Orders Table */}
            <Card className="rounded-3xl border border-border overflow-hidden w-full min-w-0">
              <CardHeader className="p-4 border-b border-border bg-card flex flex-row items-center justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="text-sm font-black text-foreground">
                    Listagem de Vendas do Frigobar
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Histórico objetivo de vendas para controle e conciliação da Anserve
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
                            <div className="flex flex-col gap-1 items-start">
                              <Badge
                                className={
                                  o.paymentStatus === "pago"
                                    ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 text-[10px]"
                                    : "bg-amber-500/15 text-amber-700 border-amber-500/30 text-[10px]"
                                }
                              >
                                {o.paymentStatus === "pago" ? "Pago" : "Pendente"} (
                                {o.paymentMethod === "pix"
                                  ? "PIX"
                                  : o.paymentMethod === "credit_card"
                                  ? "Cartão"
                                  : "Cobrança"}
                                )
                              </Badge>
                            </div>
                          </td>
                          <td className="p-3.5">
                            {o.invoiceStatus === "anexada" ? (
                              <div className="flex flex-col items-start gap-1">
                                <Badge className="bg-sky-500/15 text-sky-700 border-sky-500/30 text-[10px]">
                                  Emitida {o.invoiceNumber ? `#${o.invoiceNumber}` : ""}
                                </Badge>
                                <button
                                  type="button"
                                  onClick={() => handleOpenRetryModal(o)}
                                  className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"
                                >
                                  <RefreshCw className="w-2.5 h-2.5" />
                                  Reenviar / Corrigir
                                </button>
                              </div>
                            ) : (
                              <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-500/40">
                                Pendente NF
                              </Badge>
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

          {/* TAB 3: GESTÃO DE FUNCIONÁRIAS & PRODUTIVIDADE ANSERVE */}
          <TabsContent value="equipe" className="w-full min-w-0 space-y-5">
            {/* Top Action Bar */}
            <div className="bg-card border border-border p-4 sm:p-5 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full min-w-0">
              <div className="space-y-1 min-w-0">
                <h3 className="text-sm sm:text-base font-black text-foreground flex items-center gap-2">
                  <Users className="w-5 h-5 text-teal-600 shrink-0" />
                  <span>Equipe de Reposição & Conferência (Anserve)</span>
                </h3>
                <p className="text-xs text-muted-foreground">
                  Cadastre suas funcionárias, redefina senhas ou PINs de acesso rápido no celular e acompanhe a produtividade individual.
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
                  <span>Nova Funcionária</span>
                </Button>
              </div>
            </div>

            {/* Productivity Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 w-full min-w-0">
              <Card className="rounded-3xl border border-border bg-card p-3.5 sm:p-4 space-y-1 min-w-0">
                <span className="text-[11px] text-muted-foreground font-semibold">Funcionárias Cadastradas</span>
                <div className="text-xl sm:text-2xl font-black text-foreground">{staffList.length}</div>
                <span className="text-[10px] text-emerald-600 font-bold block">
                  {staffList.filter(s => s.active !== false).length} ativas para vistoria
                </span>
              </Card>

              <Card className="rounded-3xl border border-border bg-card p-3.5 sm:p-4 space-y-1 min-w-0">
                <span className="text-[11px] text-muted-foreground font-semibold">Conferências no Período</span>
                <div className="text-xl sm:text-2xl font-black text-teal-600">
                  {reportsData?.productivitySummary?.totalInspections || 0}
                </div>
                <span className="text-[10px] text-muted-foreground block">
                  {reportsData?.productivitySummary?.totalConforme || 0} conformes •{" "}
                  {reportsData?.productivitySummary?.totalDiscrepancies || 0} com divergência
                </span>
              </Card>

              <Card className="rounded-3xl border border-border bg-card p-3.5 sm:p-4 space-y-1 min-w-0">
                <span className="text-[11px] text-muted-foreground font-semibold">Unidades Repostas</span>
                <div className="text-xl sm:text-2xl font-black text-sky-600">
                  {staffList.reduce((acc, s) => acc + (s.productivity?.totalItemsRestockedQty || 0), 0)} un.
                </div>
                <span className="text-[10px] text-muted-foreground block">
                  {staffList.reduce((acc, s) => acc + (s.productivity?.paidItemsRestockedQty || 0), 0)} pagos +{" "}
                  {staffList.reduce((acc, s) => acc + (s.productivity?.courtesyItemsRestockedQty || 0), 0)} cortesias
                </span>
              </Card>

              <Card className="rounded-3xl border border-border bg-card p-3.5 sm:p-4 space-y-1 min-w-0">
                <span className="text-[11px] text-muted-foreground font-semibold">Consumos Não Declarados Apurados</span>
                <div className="text-xl sm:text-2xl font-black text-amber-600">
                  R${" "}
                  {staffList
                    .reduce((acc, s) => acc + (s.productivity?.discrepancyAmountDetected || 0), 0)
                    .toFixed(2)}
                </div>
                <span className="text-[10px] text-emerald-600 font-semibold block">
                  R${" "}
                  {staffList
                    .reduce((acc, s) => acc + (s.productivity?.discrepancyAmountRecovered || 0), 0)
                    .toFixed(2)}{" "}
                  já pagos pelos hóspedes
                </span>
              </Card>
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
                    Cadastre o número do WhatsApp que ficará no celular de trabalho das repositoras. Ao fazerem o <strong>1º login do dia</strong>, elas recebem o resumo dos flats já liberados (com horário) e quantos faltam sair. Além disso, <strong>a cada novo check-out</strong>, este número recebe o alerta imediato + resumo atualizado.
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
                      {checkoutSummary.doneCount} check-outs já realizados
                    </strong>{" "}
                    •{" "}
                    <strong className="text-amber-600">
                      {checkoutSummary.pendingCount} previstos aguardando saída
                    </strong>
                  </span>
                  {checkoutSummary.doneCheckouts?.length > 0 && (
                    <span className="text-[11px] font-mono text-foreground">
                      Liberados:{" "}
                      {checkoutSummary.doneCheckouts
                        .map((c: any) => `Flat ${c.flatNumber} (${c.checkoutTime})`)
                        .join(", ")}
                    </span>
                  )}
                </div>
              )}
            </Card>

            {/* Staff & Productivity Table */}
            <Card className="rounded-3xl border border-border overflow-hidden w-full min-w-0">
              <CardHeader className="p-4 border-b border-border bg-card">
                <CardTitle className="text-sm font-black text-foreground flex items-center gap-2">
                  <Award className="w-4 h-4 text-teal-600 shrink-0" />
                  <span>Quadro de Funcionárias & Desempenho Individual</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Gerencie acessos, senhas e acompanhe quantas conferências e reposições cada funcionária realizou no período
                </CardDescription>
              </CardHeader>

              <div className="w-full overflow-x-auto">
                <table className="w-full min-w-[740px] text-xs text-left">
                  <thead className="bg-muted/40 text-muted-foreground font-bold border-b border-border">
                    <tr>
                      <th className="p-3.5">Funcionária</th>
                      <th className="p-3.5">WhatsApp & PIN</th>
                      <th className="p-3.5 text-center">Status</th>
                      <th className="p-3.5 text-center">Conferências</th>
                      <th className="p-3.5 text-center">Itens Repostos</th>
                      <th className="p-3.5 text-center">Divergências Apontadas</th>
                      <th className="p-3.5">Última Atividade</th>
                      <th className="p-3.5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {staffList.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-muted-foreground">
                          Nenhuma funcionária cadastrada ainda. Clique em "Nova Funcionária" para adicionar.
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
                                <div className="text-[10px] text-muted-foreground">
                                  PIN Mobile:{" "}
                                  <strong className="font-mono text-foreground">
                                    {member.pin || "1234 (Padrão)"}
                                  </strong>
                                </div>
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

                            <td className="p-3.5 text-center">
                              <div className="font-bold text-amber-600">
                                {p?.discrepancyCount || 0} apontamentos
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                R$ {Number(p?.discrepancyAmountDetected || 0).toFixed(2)}
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
                                  title="Ver relatório e histórico de conferências desta funcionária"
                                  className="h-7 px-2 rounded-lg text-[11px] font-bold text-teal-600"
                                >
                                  <Eye className="w-3.5 h-3.5 mr-1" />
                                  Relatório
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
                                  title="Excluir funcionária"
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
          </TabsContent>

          {/* TAB 4: VISÃO DE ESTOQUE E REPOSIÇÕES */}
          <TabsContent value="estoque" className="w-full min-w-0 space-y-4">
            <Card className="rounded-3xl border border-border overflow-hidden w-full min-w-0">
              <CardHeader className="p-4 border-b border-border bg-card flex flex-row items-center justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="text-sm font-black text-foreground">
                    Histórico de Conferências & Reposições Físicas nos Flats
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Registro auditável de todas as vistorias feitas pelas repositoras no período selecionado
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-xs font-bold shrink-0">
                  {(reportsData?.productivitySummary?.inspections || []).length} vistorias
                </Badge>
              </CardHeader>

              <div className="w-full overflow-x-auto">
                <table className="w-full min-w-[640px] text-xs text-left">
                  <thead className="bg-muted/40 text-muted-foreground font-bold border-b border-border">
                    <tr>
                      <th className="p-3.5">Data / Hora</th>
                      <th className="p-3.5">Flat</th>
                      <th className="p-3.5">Funcionária</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5">Itens Repostos</th>
                      <th className="p-3.5">Observações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(reportsData?.productivitySummary?.inspections || []).length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-muted-foreground">
                          Nenhuma conferência registrada no período.
                        </td>
                      </tr>
                    ) : (
                      (reportsData?.productivitySummary?.inspections || []).map((insp: any) => (
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
                            {insp.hasDiscrepancy || insp.status === "divergencia" ? (
                              <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30 text-[10px]">
                                Divergência (R$ {Number(insp.discrepancyTotalAmount || 0).toFixed(2)})
                              </Badge>
                            ) : (
                              <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 text-[10px]">
                                Conforme
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
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          {/* TAB 5: EXTRATO DE REPASSE ANSERVE */}
          <TabsContent value="extrato" className="space-y-5">
            {settlement && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="rounded-3xl border border-border bg-card p-4 space-y-1">
                  <span className="text-[11px] text-muted-foreground font-semibold">Total Vendido (Bruto)</span>
                  <div className="text-xl font-black text-foreground">
                    R$ {Number(settlement.totalOrdersAmount || 0).toFixed(2)}
                  </div>
                  <span className="text-[10px] text-muted-foreground block">
                    {settlement.ordersCount || 0} consumos pagos
                  </span>
                </Card>

                <Card className="rounded-3xl border border-border bg-card p-4 space-y-1">
                  <span className="text-[11px] text-muted-foreground font-semibold">Taxas de Cartão / PIX</span>
                  <div className="text-xl font-black text-red-600 dark:text-red-400">
                    - R$ {Number(settlement.totalFees || (settlement.cardFees + settlement.pixFees) || 0).toFixed(2)}
                  </div>
                  <span className="text-[10px] text-muted-foreground block">
                    Cartão 3.99% • PIX 0.99% Inter
                  </span>
                </Card>

                <Card className="rounded-3xl border border-border bg-card p-4 space-y-1">
                  <span className="text-[11px] text-muted-foreground font-semibold">Reembolso de Cortesias</span>
                  <div className="text-xl font-black text-sky-600 dark:text-sky-400">
                    + R$ {Number(settlement.courtesyRestockCost || 0).toFixed(2)}
                  </div>
                  <span className="text-[10px] text-muted-foreground block">
                    Nespresso + Balas + Amendoim
                  </span>
                </Card>

                <Card className="rounded-3xl border border-emerald-500/40 bg-emerald-500/10 p-4 space-y-1 shadow-md shadow-emerald-500/5">
                  <span className="text-[11px] text-emerald-800 dark:text-emerald-300 font-bold uppercase tracking-wide">
                    Líquido a Repassar (Anserve)
                  </span>
                  <div className="text-2xl font-black text-emerald-700 dark:text-emerald-300">
                    R$ {Number(settlement.netPayableToAnserve || 0).toFixed(2)}
                  </div>
                  <span className="text-[10px] text-emerald-800/80 dark:text-emerald-300/80 block">
                    Saldo líquido final a transferir
                  </span>
                </Card>
              </div>
            )}

            <div className="p-4 rounded-3xl bg-muted/40 border border-border text-xs text-muted-foreground space-y-1">
              <strong className="text-foreground">Fórmula de Fechamento CorpFlats ↔ Anserve:</strong>
              <div>
                <code>
                  Repasse Líquido = Total Vendido - Taxas Gateway (Cartão 3.99% / PIX 0.99%) - Comissão CorpFlats + Crédito Cortesias Repostas
                </code>
              </div>
            </div>
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

        {/* Modal: Relatório Individual de Conferências da Funcionária */}
        <Dialog open={Boolean(historyModalStaff)} onOpenChange={() => setHistoryModalStaff(null)}>
          <DialogContent className="sm:max-w-2xl rounded-3xl p-6 max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base font-black flex items-center gap-2">
                <Award className="w-5 h-5 text-teal-600" />
                <span>Relatório Individual — {historyModalStaff?.name}</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                Histórico de conferências, reposições e divergências apontadas por @{historyModalStaff?.username} no período.
              </DialogDescription>
            </DialogHeader>

            {historyModalStaff && (
              <div className="space-y-4 py-2 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-2xl bg-muted/40 border border-border">
                    <span className="text-[10px] text-muted-foreground block">Conferências</span>
                    <strong className="text-base font-black">
                      {historyModalStaff.productivity?.inspectionsCount || 0}
                    </strong>
                  </div>
                  <div className="p-3 rounded-2xl bg-muted/40 border border-border">
                    <span className="text-[10px] text-muted-foreground block">Flats Vistoriados</span>
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
                  <div className="p-3 rounded-2xl bg-muted/40 border border-border">
                    <span className="text-[10px] text-muted-foreground block">Divergências</span>
                    <strong className="text-base font-black text-amber-600">
                      R$ {Number(historyModalStaff.productivity?.discrepancyAmountDetected || 0).toFixed(2)}
                    </strong>
                  </div>
                </div>

                <div className="border border-border rounded-2xl overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted/40 text-muted-foreground font-bold border-b border-border">
                      <tr>
                        <th className="p-2.5">Data/Hora</th>
                        <th className="p-2.5">Flat</th>
                        <th className="p-2.5">Status</th>
                        <th className="p-2.5">Reposição</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(historyModalStaff.productivity?.recentInspections || []).length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-6 text-center text-muted-foreground">
                            Nenhuma vistoria registrada para esta funcionária no período selecionado.
                          </td>
                        </tr>
                      ) : (
                        (historyModalStaff.productivity?.recentInspections || []).map((insp: any) => (
                          <tr key={insp.id}>
                            <td className="p-2.5 font-mono text-[11px]">
                              {insp.inspectedAt ? new Date(insp.inspectedAt).toLocaleString("pt-BR") : "-"}
                            </td>
                            <td className="p-2.5 font-bold">Flat {insp.flatNumber}</td>
                            <td className="p-2.5">
                              {insp.hasDiscrepancy || insp.status === "divergencia" ? (
                                <Badge className="bg-amber-500/15 text-amber-700 text-[10px]">
                                  Divergência (R$ {Number(insp.discrepancyTotalAmount || 0).toFixed(2)})
                                </Badge>
                              ) : (
                                <Badge className="bg-emerald-500/15 text-emerald-700 text-[10px]">
                                  Conforme
                                </Badge>
                              )}
                            </td>
                            <td className="p-2.5">
                              {(insp.restockedItems || [])
                                .map((it: any) => `${it.quantity}x ${it.productName || it.productId}`)
                                .join(", ") || "-"}
                            </td>
                          </tr>
                        ))
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
