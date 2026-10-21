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
  ExternalLink,
  Printer,
  ChevronRight,
  Filter,
  Sparkles,
  ArrowUpRight,
  Check,
  X
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
  orders?: any[];
  inspections?: any[];
}

export interface InspectionItem {
  id: string;
  flatNumber: string;
  reservationCode?: string;
  inspectedBy?: string;
  inspectedAt: string;
  status: "conforme" | "divergencia";
  hasDiscrepancy?: boolean;
  discrepancyTotalAmount?: number;
  restockedCourtesyTotalCost?: number;
  restockedPaidItemsTotalCost?: number;
  restockedItems?: Array<{
    productId: string;
    productName?: string;
    quantity: number;
    isCourtesy?: boolean;
    unitCost?: number;
    totalCost?: number;
  }>;
  photos?: string[];
  notes?: string;
}

export default function AnserveDashboardPage() {
  const { data: user } = useGetMe();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<"nfs" | "estoque" | "extrato">("nfs");

  // Data states
  const [pendingOrders, setPendingOrders] = useState<PendingInvoiceOrder[]>([]);
  const [inspections, setInspections] = useState<InspectionItem[]>([]);
  const [settlement, setSettlement] = useState<SettlementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Settlement date filters
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1); // 1st day of current month
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });

  // Search in invoices
  const [invoiceSearch, setInvoiceSearch] = useState("");

  // Invoice attachment modal state
  const [selectedOrderForInvoice, setSelectedOrderForInvoice] = useState<PendingInvoiceOrder | null>(null);
  const [invoiceNumberInput, setInvoiceNumberInput] = useState("");
  const [invoiceFileData, setInvoiceFileData] = useState<string | null>(null);
  const [invoiceFileName, setInvoiceFileName] = useState("");
  const [uploadingInvoice, setUploadingInvoice] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch pending invoices
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

  // Fetch settlement extrato
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

  // Fetch all data
  const loadAllData = async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchPendingInvoices(), fetchSettlement()]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, [startDate, endDate]);

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

  // Helper description preference label
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

  // Filtered invoices
  const filteredOrders = useMemo(() => {
    return pendingOrders.filter((ord) => {
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

  return (
    <Shell>
      <div className="max-w-7xl mx-auto px-4 py-4 md:py-6 space-y-6 pb-24">
        {/* Header */}
        <div className="bg-card border border-border p-6 rounded-3xl shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-black text-foreground">
                  Painel de Supervisão Anserve
                </h1>
                <Badge className="bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30 text-[10px] font-bold">
                  Parceira Frigobar
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Emissão e anexo de Notas Fiscais com disparo multicanal, visão de estoque e conciliação de repasse.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={loadAllData}
              disabled={refreshing}
              className="rounded-xl text-xs font-bold h-9"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </div>

        {/* Tabs Control */}
        <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="space-y-4">
          <TabsList className="bg-muted/50 p-1 rounded-2xl border border-border inline-flex">
            <TabsTrigger value="nfs" className="rounded-xl text-xs font-bold px-4 py-2 flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-primary" />
              <span>Fila de Notas Fiscais</span>
              {pendingOrders.length > 0 && (
                <span className="bg-amber-500 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full">
                  {pendingOrders.length}
                </span>
              )}
            </TabsTrigger>

            <TabsTrigger value="extrato" className="rounded-xl text-xs font-bold px-4 py-2 flex items-center gap-2">
              <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
              <span>Extrato de Repasse</span>
            </TabsTrigger>

            <TabsTrigger value="estoque" className="rounded-xl text-xs font-bold px-4 py-2 flex items-center gap-2">
              <Package className="w-3.5 h-3.5 text-sky-600" />
              <span>Estoque & Reposições</span>
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: FILA DE NOTAS FISCAIS PENDENTES */}
          <TabsContent value="nfs" className="space-y-4">
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
                  onChange={(e) => setInvoiceSearch(e.target.value)}
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
                {filteredOrders.map((ord) => {
                  const docNumber =
                    ord.fiscalPreferences?.documentNumber || ord.guestDocument || "Não informado";
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
                                {ord.items.map((it) => `${it.quantity}x ${it.productName || it.productId}`).join(", ")}
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

          {/* TAB 2: EXTRATO DE REPASSE ANSERVE */}
          <TabsContent value="extrato" className="space-y-5">
            {/* Date Filters Header */}
            <div className="bg-card border border-border p-4 rounded-3xl flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" />
                <span className="text-xs font-bold text-foreground">Período de Conciliação:</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground">De:</span>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-8 text-xs rounded-xl w-36 font-mono"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground">Até:</span>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="h-8 text-xs rounded-xl w-36 font-mono"
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={fetchSettlement}
                  className="rounded-xl text-xs font-bold h-8"
                >
                  Filtrar
                </Button>
              </div>
            </div>

            {/* Financial Summary Cards */}
            {settlement && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Total Vendido Bruto */}
                <Card className="rounded-3xl border border-border bg-card p-4 space-y-1">
                  <span className="text-[11px] text-muted-foreground font-semibold">Total Vendido (Bruto)</span>
                  <div className="text-xl font-black text-foreground">
                    R$ {Number(settlement.totalOrdersAmount || 0).toFixed(2)}
                  </div>
                  <span className="text-[10px] text-muted-foreground block">
                    {settlement.ordersCount || 0} consumos pagos
                  </span>
                </Card>

                {/* 2. Taxas Gateway (Cartão 3.99% + PIX 0.99%) */}
                <Card className="rounded-3xl border border-border bg-card p-4 space-y-1">
                  <span className="text-[11px] text-muted-foreground font-semibold">Taxas de Cartão / PIX</span>
                  <div className="text-xl font-black text-red-600 dark:text-red-400">
                    - R$ {Number(settlement.totalFees || (settlement.cardFees + settlement.pixFees) || 0).toFixed(2)}
                  </div>
                  <span className="text-[10px] text-muted-foreground block">
                    Cartão 3.99% • PIX 0.99% Inter
                  </span>
                </Card>

                {/* 3. Crédito de Cortesias */}
                <Card className="rounded-3xl border border-border bg-card p-4 space-y-1">
                  <span className="text-[11px] text-muted-foreground font-semibold">Reembolso de Cortesias</span>
                  <div className="text-xl font-black text-sky-600 dark:text-sky-400">
                    + R$ {Number(settlement.courtesyRestockCost || 0).toFixed(2)}
                  </div>
                  <span className="text-[10px] text-muted-foreground block">
                    Nespresso + Balas + Amendoim
                  </span>
                </Card>

                {/* 4. Líquido a Repassar para a Anserve */}
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

            {/* Extrato Formula Note */}
            <div className="p-4 rounded-3xl bg-muted/40 border border-border text-xs text-muted-foreground space-y-1">
              <strong className="text-foreground">Fórmula de Fechamento CorpFlats ↔ Anserve:</strong>
              <div>
                <code>Repasse Líquido = Total Vendido - Taxas Gateway (Cartão 3.99% / PIX 0.99%) - Comissão CorpFlats + Crédito Cortesias Repostas</code>
              </div>
            </div>
          </TabsContent>

          {/* TAB 3: VISÃO DE ESTOQUE E REPOSIÇÕES */}
          <TabsContent value="estoque" className="space-y-4">
            <div className="bg-card border border-border rounded-3xl p-6 text-center space-y-2">
              <Package className="w-10 h-10 text-primary mx-auto" />
              <h3 className="text-sm font-bold text-foreground">Relatório de Saídas e Reposições Físicas</h3>
              <p className="text-xs text-muted-foreground max-w-lg mx-auto">
                Visão consolidada das vistorias realizadas pela repositora em cada flat, quantidade de cortesias repostas e histórico de conformidade.
              </p>
            </div>
          </TabsContent>
        </Tabs>

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
                {/* Resumo do Pedido e Preferência Fiscal */}
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

                {/* Número da Nota Fiscal */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Número da Nota Fiscal (NFS-e / DANFE)</Label>
                  <Input
                    placeholder="ex: 1042"
                    value={invoiceNumberInput}
                    onChange={(e) => setInvoiceNumberInput(e.target.value)}
                    className="h-9 text-xs rounded-xl font-mono"
                  />
                </div>

                {/* Upload do Arquivo (PDF ou Imagem) */}
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
                        <div className="text-xs font-semibold text-foreground">Clique para selecionar o PDF ou foto</div>
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

                {/* Disparo Automático Banner */}
                <div className="p-3 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-800 dark:text-sky-300 text-[11px] space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5" />
                    <span>Disparo Automático Ativo</span>
                  </div>
                  <div>
                    Ao clicar em confirmar, o documento será disparado para o WhatsApp ({selectedOrderForInvoice.guestPhone || "cadastrado"}) e enviado para o e-mail ({selectedOrderForInvoice.fiscalPreferences?.email || selectedOrderForInvoice.guestEmail}).
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
      </div>
    </Shell>
  );
}
