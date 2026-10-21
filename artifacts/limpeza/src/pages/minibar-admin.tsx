import React, { useState, useEffect, useMemo, useRef } from "react";
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
  ChevronDown,
  ChevronUp,
  Image as ImageIcon
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

export default function MinibarAdminPage() {
  const { data: user } = useGetMe();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<"catalogo" | "gabarito" | "qrcodes" | "extrato">("catalogo");

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
  const [qrOriginUrl, setQrOriginUrl] = useState(() => {
    if (typeof window !== "undefined") {
      return window.location.origin;
    }
    return "https://corpflats.onrender.com";
  });

  // Extrato State
  const [settlementData, setSettlementData] = useState<any>(null);
  const [extratoStartDate, setExtratoStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [extratoEndDate, setExtratoEndDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });

  // Fetch Products
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

  // Fetch Default Stock
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

  // Fetch Extrato Settlement
  const fetchSettlement = async () => {
    try {
      const res = await fetch(`/api/minibar/settlement?startDate=${extratoStartDate}&endDate=${extratoEndDate}`, {
        credentials: "include"
      });
      if (res.ok) {
        const data = await res.json();
        setSettlementData(data);
      }
    } catch (err) {
      console.error("[MinibarAdmin] Erro ao carregar extrato:", err);
    }
  };

  // Load all initial data
  const loadAll = async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchProducts(), fetchDefaultStock(), fetchSettlement()]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  // Update stock quantities state when flat selection changes
  const loadQuantitiesForFlat = (flatKey: string, stockData: DefaultStockData | null) => {
    const data = stockData || defaultStock;
    if (!data) return;

    const map: Record<string, number> = {};
    if (flatKey === "global") {
      const template = data.globalTemplate;
      if (Array.isArray(template)) {
        template.forEach((item) => {
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
        override.forEach((item) => {
          map[item.productId] = Number(item.quantity) || 0;
        });
      } else {
        // Fallback to global
        const template = data.globalTemplate;
        if (Array.isArray(template)) {
          template.forEach((item) => {
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

  // Open Product Modal (New or Edit)
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

  // Save Product
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

      let res;
      if (editingProduct) {
        res = await fetch(`/api/minibar/products/${editingProduct.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload)
        });
      } else {
        res = await fetch("/api/minibar/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload)
        });
      }

      const data = await res.json();
      if (res.ok && data.success) {
        toast({
          title: editingProduct ? "Produto atualizado! ✨" : "Produto cadastrado com sucesso! ✨",
          description: `${payload.name} salvo no catálogo de frigobar.`
        });
        setProductModalOpen(false);
        fetchProducts();
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

  // Save Default Stock Matrix
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

  // Trigger Print for all A6 QR codes
  const handlePrintAllQrCodes = () => {
    window.print();
  };

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (selectedCategory !== "todas" && p.category !== selectedCategory) return false;
      if (productSearch.trim()) {
        const q = productSearch.toLowerCase().trim();
        return p.name.toLowerCase().includes(q) || (p.description && p.description.toLowerCase().includes(q));
      }
      return true;
    });
  }, [products, selectedCategory, productSearch]);

  return (
    <Shell>
      {/* Estilos dedicados para impressão de cartões em Acrílico A6 */}
      <style>{`
        @media print {
          body {
            background: white !important;
            color: black !important;
          }
          aside, nav, header, footer, .print\\:hidden {
            display: none !important;
          }
          .print-qr-grid {
            display: grid !important;
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 16px !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .print-card-a6 {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            border: 1.5px solid #000 !important;
            border-radius: 12px !important;
            padding: 16px !important;
            height: 480px !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            align-items: center !important;
            text-align: center !important;
            box-sizing: border-box !important;
          }
        }
      `}</style>

      <div className="max-w-7xl mx-auto px-4 py-4 md:py-6 space-y-6 pb-24 print:hidden">
        {/* Header */}
        <div className="bg-card border border-border p-6 rounded-3xl shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-black text-foreground">
                  Gestão de Frigobar (CorpFlats)
                </h1>
                <Badge className="bg-primary/15 text-primary border-primary/30 text-[10px] font-bold">
                  Admin & Acrílicos A6
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Catálogo, gabarito nominal por flat, gerador de QR Codes para impressão e extrato financeiro.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={loadAll}
              disabled={refreshing}
              className="rounded-xl text-xs font-bold h-9"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="space-y-4">
          <TabsList className="bg-muted/50 p-1 rounded-2xl border border-border inline-flex">
            <TabsTrigger value="catalogo" className="rounded-xl text-xs font-bold px-4 py-2 flex items-center gap-2">
              <Package className="w-3.5 h-3.5 text-primary" />
              <span>Catálogo & Cortesias</span>
            </TabsTrigger>

            <TabsTrigger value="gabarito" className="rounded-xl text-xs font-bold px-4 py-2 flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5 text-sky-600" />
              <span>Gabarito por Flat</span>
            </TabsTrigger>

            <TabsTrigger value="qrcodes" className="rounded-xl text-xs font-bold px-4 py-2 flex items-center gap-2">
              <QrCode className="w-3.5 h-3.5 text-indigo-600" />
              <span>Gerador de QR Codes A6</span>
            </TabsTrigger>

            <TabsTrigger value="extrato" className="rounded-xl text-xs font-bold px-4 py-2 flex items-center gap-2">
              <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
              <span>Extrato CorpFlats ↔ Anserve</span>
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: CATÁLOGO */}
          <TabsContent value="catalogo" className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  size="sm"
                  variant={selectedCategory === "todas" ? "default" : "outline"}
                  onClick={() => setSelectedCategory("todas")}
                  className="h-8 rounded-xl text-xs font-bold"
                >
                  Todas as Categorias
                </Button>
                {CATEGORIES.map((cat) => (
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

              <div className="flex items-center gap-2">
                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar produto..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="h-8 pl-9 text-xs rounded-xl"
                  />
                </div>

                <Button
                  size="sm"
                  onClick={() => handleOpenProductModal()}
                  className="rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 h-8 shrink-0"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Novo Produto
                </Button>
              </div>
            </div>

            {/* Products Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProducts.map((p) => (
                <Card key={p.id} className="rounded-3xl border border-border bg-card p-4 space-y-3 shadow-xs">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt={p.name} className="w-12 h-12 rounded-2xl object-cover shrink-0" />
                      ) : (
                        <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-black text-sm shrink-0">
                          🧊
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-1.5">
                          <strong className="text-sm font-bold text-foreground">{p.name}</strong>
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
                      className="h-8 w-8 rounded-xl text-muted-foreground hover:text-foreground"
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

          {/* TAB 2: GABARITO POR FLAT */}
          <TabsContent value="gabarito" className="space-y-4">
            <div className="bg-card border border-border p-4 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <h3 className="text-sm font-bold text-foreground">Configuração do Gabarito Nominal do Frigobar</h3>
                <p className="text-xs text-muted-foreground">
                  Ajuste a quantidade padrão de cada item que deve constar no frigobar abastecido.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-muted-foreground">Aplicar em:</span>
                <select
                  value={selectedFlatForStock}
                  onChange={(e) => handleSelectFlatForStock(e.target.value)}
                  className="h-8 text-xs rounded-xl border border-input bg-background px-3 font-bold"
                >
                  <option value="global">🌐 Padrão Global (Todos os Flats)</option>
                  {SOHO_FLATS.map((f) => (
                    <option key={f} value={f}>
                      Flat {f} (Personalizado)
                    </option>
                  ))}
                </select>

                <Button
                  size="sm"
                  onClick={handleSaveDefaultStock}
                  disabled={savingStock}
                  className="rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 h-8"
                >
                  {savingStock ? "Salvando..." : "Salvar Gabarito"}
                </Button>
              </div>
            </div>

            {/* Steppers Matrix */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {products.map((prod) => {
                const qty = stockQuantities[prod.id] || 0;
                return (
                  <div
                    key={prod.id}
                    className="p-3.5 rounded-2xl bg-card border border-border flex items-center justify-between gap-3 shadow-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      {prod.imageUrl ? (
                        <img src={prod.imageUrl} alt={prod.name} className="w-9 h-9 rounded-xl object-cover shrink-0" />
                      ) : (
                        <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                          🧊
                        </div>
                      )}
                      <div>
                        <div className="font-bold text-xs text-foreground">{prod.name}</div>
                        <span className="text-[10px] text-muted-foreground">{prod.category}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        disabled={qty === 0}
                        onClick={() =>
                          setStockQuantities((prev) => ({
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
                          setStockQuantities((prev) => ({
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

          {/* TAB 3: GERADOR DE QR CODES A6 */}
          <TabsContent value="qrcodes" className="space-y-4">
            <div className="bg-card border border-border p-4 md:p-6 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-base font-black text-foreground flex items-center gap-2">
                  <QrCode className="w-5 h-5 text-indigo-600" />
                  <span>Displays de Acrílico A6 por Flat (19 Flats Soho)</span>
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

            {/* Grid of A6 Preview Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {SOHO_FLATS.map((flatNumber) => {
                const targetUrl = `${qrOriginUrl}/frigobar/flat/${flatNumber}`;
                const qrImgSrc = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(targetUrl)}`;

                return (
                  <Card
                    key={flatNumber}
                    className="rounded-3xl border-2 border-border/80 bg-card p-5 text-center flex flex-col items-center justify-between shadow-xs hover:border-indigo-500/50 transition-all space-y-3"
                  >
                    {/* Header Acrílico */}
                    <div className="space-y-0.5">
                      <div className="text-[10px] font-black uppercase tracking-widest text-primary">
                        CORPFLATS • SOHO RESIDENCE
                      </div>
                      <div className="text-xl font-black text-foreground">FLAT {flatNumber}</div>
                    </div>

                    {/* QR Code Image */}
                    <div className="p-3 bg-white rounded-2xl shadow-xs border border-slate-200">
                      <img src={qrImgSrc} alt={`QR Code Flat ${flatNumber}`} className="w-36 h-36" />
                    </div>

                    {/* Instructions */}
                    <div className="space-y-1 text-[11px] text-muted-foreground">
                      <p className="font-bold text-foreground">Frigobar Express no seu celular</p>
                      <p className="text-[10px]">Aponte a câmera, confirme os 4 dígitos do telefone e aproveite!</p>
                    </div>

                    {/* Payment Logos Badge */}
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
                      onClick={() => setSelectedFlatForQrPreview(flatNumber)}
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

          {/* TAB 4: EXTRATO CORPFLATS ↔ ANSERVE */}
          <TabsContent value="extrato" className="space-y-5">
            <div className="bg-card border border-border p-4 rounded-3xl flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-bold text-foreground">Filtro de Extrato CorpFlats ↔ Anserve:</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground">De:</span>
                  <Input
                    type="date"
                    value={extratoStartDate}
                    onChange={(e) => setExtratoStartDate(e.target.value)}
                    className="h-8 text-xs rounded-xl w-36 font-mono"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground">Até:</span>
                  <Input
                    type="date"
                    value={extratoEndDate}
                    onChange={(e) => setExtratoEndDate(e.target.value)}
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
                    - R$ {Number(settlementData.totalFees || 0).toFixed(2)}
                  </div>
                  <span className="text-[10px] text-muted-foreground block">
                    Mercado Pago + PIX Inter
                  </span>
                </Card>

                <Card className="rounded-3xl border border-border bg-card p-4 space-y-1">
                  <span className="text-[11px] text-muted-foreground font-semibold">Comissão CorpFlats</span>
                  <div className="text-xl font-black text-amber-600 dark:text-amber-400">
                    - R$ {Number(settlementData.commissionCorpFlats || 0).toFixed(2)}
                  </div>
                  <span className="text-[10px] text-muted-foreground block">
                    Retenção acordada de intermediação
                  </span>
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
                  onChange={(e) => setPName(e.target.value)}
                  className="h-9 text-xs rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Categoria</Label>
                <select
                  value={pCategory}
                  onChange={(e) => setPCategory(e.target.value)}
                  className="w-full h-9 rounded-xl border border-input bg-background px-3 font-medium text-xs"
                >
                  {CATEGORIES.map((cat) => (
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
                    onChange={(e) => setPPrice(e.target.value)}
                    className="h-9 text-xs rounded-xl font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Custo / Repasse Anserve (R$)</Label>
                  <Input
                    placeholder="6.50"
                    value={pCost}
                    onChange={(e) => setPCost(e.target.value)}
                    className="h-9 text-xs rounded-xl font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">URL da Imagem / Foto</Label>
                <Input
                  placeholder="https://images.unsplash.com/..."
                  value={pImageUrl}
                  onChange={(e) => setPImageUrl(e.target.value)}
                  className="h-9 text-xs rounded-xl font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Descrição Curta</Label>
                <Input
                  placeholder="ex: Long neck gelada 330ml"
                  value={pDescription}
                  onChange={(e) => setPDescription(e.target.value)}
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
                  onChange={(e) => setPIsCourtesy(e.target.checked)}
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
      </div>

      {/* RENDERIZAÇÃO LIMPA PARA IMPRESSÃO A6 (PRINT ONLY) */}
      <div className="hidden print:block print-qr-grid">
        {SOHO_FLATS.map((flatNumber) => {
          const targetUrl = `${qrOriginUrl}/frigobar/flat/${flatNumber}`;
          const qrImgSrc = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(targetUrl)}`;

          return (
            <div key={flatNumber} className="print-card-a6">
              <div style={{ marginTop: "10px" }}>
                <div style={{ fontSize: "11px", fontWeight: "900", letterSpacing: "2px", color: "#333" }}>
                  CORPFLATS • SOHO RESIDENCE
                </div>
                <div style={{ fontSize: "32px", fontWeight: "900", marginTop: "4px" }}>
                  FLAT {flatNumber}
                </div>
                <div style={{ fontSize: "13px", fontWeight: "700", color: "#555" }}>
                  🧊 Frigobar Express no seu Celular
                </div>
              </div>

              <div style={{ margin: "14px 0", padding: "10px", background: "white", borderRadius: "12px", border: "1px solid #ddd" }}>
                <img src={qrImgSrc} alt={`QR Code Flat ${flatNumber}`} style={{ width: "180px", height: "180px" }} />
              </div>

              <div style={{ fontSize: "11px", lineHeight: "1.4", maxWidth: "240px", marginBottom: "8px" }}>
                <strong>1.</strong> Aponte a câmera do seu celular para o QR Code acima.<br />
                <strong>2.</strong> Confirme os 4 últimos dígitos do seu telefone.<br />
                <strong>3.</strong> Escolha suas bebidas e pague via PIX ou Cartão.
              </div>

              <div style={{ fontSize: "9px", color: "#666", borderTop: "1px solid #eee", paddingTop: "8px", width: "100%" }}>
                Pagamento instantâneo via <strong>PIX Banco Inter</strong> e <strong>Cartão de Crédito</strong>.<br />
                Faturado separadamente da hospedagem.
              </div>
            </div>
          );
        })}
      </div>
    </Shell>
  );
}
