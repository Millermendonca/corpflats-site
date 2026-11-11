import React, { useState, useEffect, useMemo } from "react";
import { Shell } from "@/components/layout";
import { MinibarEcosystemNav } from "@/components/minibar-ecosystem-nav";
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
  Briefcase,
  Camera,
  ZoomIn,
  ArrowRight,
  CheckCheck,
  RotateCcw,
  FileCheck,
  Gift
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
  "Água & Sucos",
  "Refrigerantes",
  "Cervejas & Alcoólicos",
  "Snacks & Chocolates",
  "Cafés & Especiais"
];

export interface BrandHomologationItem {
  id: string;
  productName: string;
  category: "Bebidas" | "Petiscos" | "Kit Boas-Vindas";
  currentImageUrl: string;
  currentDiagnosis: string;
  proposedBrand: {
    brandName: string;
    imageUrl: string;
    manufacturer: string;
    volumeOrWeight: string;
    packageType: string;
  };
  alternatives: Array<{
    brandName: string;
    imageUrl: string;
    manufacturer: string;
    volumeOrWeight: string;
    packageType: string;
  }>;
  status: "approved" | "pending" | "swap_requested";
  selectedBrandIndex: number;
  notes?: string;
  isCourtesy?: boolean;
}

export const INITIAL_HOMOLOGATION_CATALOG: BrandHomologationItem[] = [
  {
    id: "prod_refrigerante",
    productName: "Refrigerante",
    category: "Bebidas",
    currentImageUrl: "/images/frigobar/refrigerante.png",
    currentDiagnosis: "Marca fictícia gerada por IA ('REFRIGERANTE SODA')",
    proposedBrand: {
      brandName: "Coca-Cola Original 350ml",
      imageUrl: "/images/frigobar/proposta_coca_cola_350ml.png",
      manufacturer: "The Coca-Cola Company",
      volumeOrWeight: "Lata 350ml",
      packageType: "Lata de alumínio tradicional com anel prata"
    },
    alternatives: [
      {
        brandName: "Coca-Cola Sem Açúcar 350ml",
        imageUrl: "/images/frigobar/proposta_coca_cola_zero_350ml.png",
        manufacturer: "The Coca-Cola Company",
        volumeOrWeight: "Lata 350ml",
        packageType: "Lata sleek preta com logo vermelho"
      }
    ],
    status: "pending",
    selectedBrandIndex: 0
  },
  {
    id: "prod_achocolatado",
    productName: "Achocolatado",
    category: "Bebidas",
    currentImageUrl: "/images/frigobar/achocolatado.png",
    currentDiagnosis: "Marca fictícia gerada por IA ('DELÍCIA CHOCO')",
    proposedBrand: {
      brandName: "Toddynho Tradicional 200ml",
      imageUrl: "/images/frigobar/proposta_toddynho_200ml.png",
      manufacturer: "PepsiCo do Brasil",
      volumeOrWeight: "Tetra Pak 200ml",
      packageType: "Caixa cartonada com canudo acoplado"
    },
    alternatives: [
      {
        brandName: "Nescau Prontinho 200ml",
        imageUrl: "/images/frigobar/proposta_toddynho_200ml.png",
        manufacturer: "Nestlé Brasil",
        volumeOrWeight: "Tetra Pak 200ml",
        packageType: "Caixa cartonada com canudo"
      }
    ],
    status: "pending",
    selectedBrandIndex: 0
  },
  {
    id: "prod_agua_mineral_copo",
    productName: "Água Mineral Copo",
    category: "Bebidas",
    currentImageUrl: "/images/frigobar/agua_mineral_copo.png",
    currentDiagnosis: "Marca fictícia gerada por IA ('Fonte Pureza')",
    proposedBrand: {
      brandName: "Água Mineral Crystal Copo 200ml",
      imageUrl: "/images/frigobar/proposta_agua_mineral_copo_200ml.png",
      manufacturer: "Coca-Cola FEMSA / Anserve",
      volumeOrWeight: "Copo 200ml",
      packageType: "Copo plástico selado com tampa metálica"
    },
    alternatives: [
      {
        brandName: "Água Mineral Levity Copo 200ml",
        imageUrl: "/images/frigobar/proposta_agua_mineral_copo_200ml.png",
        manufacturer: "Levity / Anserve",
        volumeOrWeight: "Copo 200ml",
        packageType: "Copo plástico selado"
      }
    ],
    status: "pending",
    selectedBrandIndex: 0
  },
  {
    id: "prod_agua_mineral_garrafa",
    productName: "Água Mineral Garrafa",
    category: "Bebidas",
    currentImageUrl: "/images/frigobar/agua_mineral_garrafa.png",
    currentDiagnosis: "Marca fictícia gerada por IA ('Fonte Natural 500ml')",
    proposedBrand: {
      brandName: "Água Mineral Crystal Sem Gás 500ml",
      imageUrl: "/images/frigobar/proposta_agua_mineral_garrafa_500ml.png",
      manufacturer: "Coca-Cola FEMSA",
      volumeOrWeight: "Garrafa PET 500ml",
      packageType: "Garrafa PET cristalina com tampa azul"
    },
    alternatives: [
      {
        brandName: "Água Mineral Minalba 510ml",
        imageUrl: "/images/frigobar/proposta_agua_mineral_garrafa_500ml.png",
        manufacturer: "Minalba Brasil",
        volumeOrWeight: "Garrafa PET 510ml",
        packageType: "Garrafa PET cristalina tampa azul"
      }
    ],
    status: "pending",
    selectedBrandIndex: 0
  },
  {
    id: "prod_cerveja_long_neck",
    productName: "Cerveja Long Neck",
    category: "Bebidas",
    currentImageUrl: "/images/frigobar/cerveja_long_neck.png",
    currentDiagnosis: "Marca fictícia gerada por IA ('Brewery 330ml')",
    proposedBrand: {
      brandName: "Cerveja Heineken Puro Malte 330ml",
      imageUrl: "/images/frigobar/proposta_cerveja_heineken_330ml.png",
      manufacturer: "Heineken Brasil",
      volumeOrWeight: "Long Neck 330ml",
      packageType: "Garrafa de vidro verde com estrela vermelha"
    },
    alternatives: [
      {
        brandName: "Cerveja Stella Artois 330ml",
        imageUrl: "/images/frigobar/proposta_cerveja_stella_artois_330ml.png",
        manufacturer: "Ambev / AB InBev",
        volumeOrWeight: "Long Neck 330ml",
        packageType: "Garrafa de vidro com rótulo dourado e branco"
      }
    ],
    status: "pending",
    selectedBrandIndex: 0
  },
  {
    id: "prod_energetico",
    productName: "Energético",
    category: "Bebidas",
    currentImageUrl: "/images/frigobar/energetico.png",
    currentDiagnosis: "Marca fictícia gerada por IA ('ENERGÉTICO 250ml')",
    proposedBrand: {
      brandName: "Red Bull Energy Drink 250ml",
      imageUrl: "/images/frigobar/proposta_energetico_red_bull_250ml.png",
      manufacturer: "Red Bull GmbH",
      volumeOrWeight: "Lata Slim 250ml",
      packageType: "Lata sleek de alumínio azul e prata"
    },
    alternatives: [
      {
        brandName: "Monster Energy Original 473ml",
        imageUrl: "/images/frigobar/proposta_energetico_red_bull_250ml.png",
        manufacturer: "Monster Beverage Corp",
        volumeOrWeight: "Lata 473ml",
        packageType: "Lata de alumínio preta com garra verde"
      }
    ],
    status: "pending",
    selectedBrandIndex: 0
  },
  {
    id: "prod_smirnoff_ice",
    productName: "Smirnoff Ice",
    category: "Bebidas",
    currentImageUrl: "/images/frigobar/smirnoff_ice.png",
    currentDiagnosis: "Recreação genérica sem precisão fotográfica",
    proposedBrand: {
      brandName: "Smirnoff Ice Original 275ml",
      imageUrl: "/images/frigobar/proposta_smirnoff_ice_275ml.png",
      manufacturer: "Diageo",
      volumeOrWeight: "Long Neck 275ml",
      packageType: "Garrafa de vidro transparente com tampa prata"
    },
    alternatives: [
      {
        brandName: "Smirnoff Ice Red 275ml",
        imageUrl: "/images/frigobar/proposta_smirnoff_ice_275ml.png",
        manufacturer: "Diageo",
        volumeOrWeight: "Long Neck 275ml",
        packageType: "Garrafa de vidro com rótulo vermelho"
      }
    ],
    status: "pending",
    selectedBrandIndex: 0
  },
  {
    id: "prod_suco_fruta",
    productName: "Suco de Fruta",
    category: "Bebidas",
    currentImageUrl: "/images/frigobar/suco_fruta.png",
    currentDiagnosis: "Marca fictícia gerada por IA ('SUCO DE FRUTA Néctar')",
    proposedBrand: {
      brandName: "Suco Del Valle Néctar Laranja 290ml",
      imageUrl: "/images/frigobar/proposta_suco_del_valle_290ml.png",
      manufacturer: "The Coca-Cola Company",
      volumeOrWeight: "Garrafa 290ml",
      packageType: "Garrafa de vidro com tampa de metal lacrada"
    },
    alternatives: [
      {
        brandName: "Suco Del Valle Néctar Pêssego 290ml",
        imageUrl: "/images/frigobar/proposta_suco_del_valle_290ml.png",
        manufacturer: "The Coca-Cola Company",
        volumeOrWeight: "Garrafa 290ml",
        packageType: "Garrafa de vidro com tampa lacrada"
      }
    ],
    status: "pending",
    selectedBrandIndex: 0
  },
  {
    id: "prod_suco_uva_integral",
    productName: "Suco de Uva Integral",
    category: "Bebidas",
    currentImageUrl: "/images/frigobar/suco_uva_integral.png",
    currentDiagnosis: "Mismatch: Rótulo exibe garrafa de 1L ('Vinhedo Puro'), mas o produto é 300ml",
    proposedBrand: {
      brandName: "Suco de Uva 100% Integral Aurora 300ml",
      imageUrl: "/images/frigobar/proposta_suco_uva_aurora_300ml.png",
      manufacturer: "Vinícola Aurora",
      volumeOrWeight: "Garrafa 300ml",
      packageType: "Garrafa de vidro escura com tampa de rosca"
    },
    alternatives: [
      {
        brandName: "Suco de Uva Casa Madeira 250ml",
        imageUrl: "/images/frigobar/proposta_suco_uva_aurora_300ml.png",
        manufacturer: "Famiglia Valduga",
        volumeOrWeight: "Garrafa 250ml",
        packageType: "Garrafa de vidro escura"
      }
    ],
    status: "pending",
    selectedBrandIndex: 0
  },
  {
    id: "prod_barra_cereal",
    productName: "Barra de Cereal",
    category: "Petiscos",
    currentImageUrl: "/images/frigobar/barra_cereal.png",
    currentDiagnosis: "Marca fictícia gerada por IA ('NATURAL HARVEST')",
    proposedBrand: {
      brandName: "Barra de Cereal Nutry Aveia, Castanhas e Mel 22g",
      imageUrl: "/images/frigobar/proposta_barra_nutry_22g.png",
      manufacturer: "Nutrimental",
      volumeOrWeight: "Barra 22g",
      packageType: "Flow-pack metalizado individual"
    },
    alternatives: [
      {
        brandName: "Barra Trio Castanha e Chocolate 25g",
        imageUrl: "/images/frigobar/proposta_barra_nutry_22g.png",
        manufacturer: "Trio Alimentos",
        volumeOrWeight: "Barra 25g",
        packageType: "Flow-pack metalizado"
      }
    ],
    status: "pending",
    selectedBrandIndex: 0
  },
  {
    id: "prod_batata",
    productName: "Batata",
    category: "Petiscos",
    currentImageUrl: "/images/frigobar/batata.png",
    currentDiagnosis: "Marca fictícia gerada por IA ('BATATA ORIGINAL')",
    proposedBrand: {
      brandName: "Batata Pringles Original 114g",
      imageUrl: "/images/frigobar/proposta_batata_pringles_114g.png",
      manufacturer: "Kellogg Company",
      volumeOrWeight: "Tubo 114g",
      packageType: "Tubo cilíndrico vermelho com tampa plástica"
    },
    alternatives: [
      {
        brandName: "Batata Ruffles Original 76g",
        imageUrl: "/images/frigobar/proposta_batata_pringles_114g.png",
        manufacturer: "PepsiCo do Brasil",
        volumeOrWeight: "Pacote 76g",
        packageType: "Pacote metalizado azul"
      }
    ],
    status: "pending",
    selectedBrandIndex: 0
  },
  {
    id: "prod_biscoito_salgado",
    productName: "Biscoito Salgado",
    category: "Petiscos",
    currentImageUrl: "/images/frigobar/biscoito_salgado.png",
    currentDiagnosis: "Marca fictícia gerada por IA ('FORNO DO BRASIL')",
    proposedBrand: {
      brandName: "Biscoito Salgado Club Social Original 24g",
      imageUrl: "/images/frigobar/proposta_biscoito_club_social_24g.png",
      manufacturer: "Mondelez International",
      volumeOrWeight: "Pacote 24g",
      packageType: "Flow-pack vermelho com crackers crocantes"
    },
    alternatives: [
      {
        brandName: "Biscoito Pit Stop Marilan 27g",
        imageUrl: "/images/frigobar/proposta_biscoito_club_social_24g.png",
        manufacturer: "Marilan Alimentos",
        volumeOrWeight: "Pacote 27g",
        packageType: "Pacote individual"
      }
    ],
    status: "pending",
    selectedBrandIndex: 0
  },
  {
    id: "prod_castanha_caju",
    productName: "Castanha de Caju",
    category: "Petiscos",
    currentImageUrl: "/images/frigobar/castanha_caju.png",
    currentDiagnosis: "Marca fictícia gerada por IA ('NATURÉL')",
    proposedBrand: {
      brandName: "Castanha de Caju Torrada e Salgada DaColônia 50g",
      imageUrl: "/images/frigobar/proposta_castanha_dacolonia_50g.png",
      manufacturer: "DaColônia Alimentos",
      volumeOrWeight: "Pouch 50g",
      packageType: "Stand-up pouch preto e dourado com zíper e visor"
    },
    alternatives: [
      {
        brandName: "Castanha de Caju Yoki 50g",
        imageUrl: "/images/frigobar/proposta_castanha_dacolonia_50g.png",
        manufacturer: "General Mills / Yoki",
        volumeOrWeight: "Pacote 50g",
        packageType: "Pouch metalizado"
      }
    ],
    status: "pending",
    selectedBrandIndex: 0
  },
  {
    id: "prod_chiclete",
    productName: "Chiclete",
    category: "Petiscos",
    currentImageUrl: "/images/frigobar/chiclete.png",
    currentDiagnosis: "Marca fictícia gerada por IA ('CHICLETE MENTHA')",
    proposedBrand: {
      brandName: "Goma de Mascar Trident Hortelã 8g (5 un)",
      imageUrl: "/images/frigobar/proposta_chiclete_trident_8g.png",
      manufacturer: "Mondelez International",
      volumeOrWeight: "Envelope 8g",
      packageType: "Envelope verde sem açúcar lacrado"
    },
    alternatives: [
      {
        brandName: "Trident Menta Intensa 8g",
        imageUrl: "/images/frigobar/proposta_chiclete_trident_8g.png",
        manufacturer: "Mondelez International",
        volumeOrWeight: "Envelope 8g",
        packageType: "Envelope azul sem açúcar"
      }
    ],
    status: "pending",
    selectedBrandIndex: 0
  },
  {
    id: "prod_chocolate",
    productName: "Chocolate",
    category: "Petiscos",
    currentImageUrl: "/images/frigobar/chocolate.png",
    currentDiagnosis: "Marca fictícia gerada por IA ('DELIGHTS MILK CHOCOLATE')",
    proposedBrand: {
      brandName: "Chocolate Nestlé Classic Ao Leite 80g",
      imageUrl: "/images/frigobar/proposta_chocolate_nestle_80g.png",
      manufacturer: "Nestlé Brasil",
      volumeOrWeight: "Tablete 80g",
      packageType: "Embalagem lacrada vermelha clássica"
    },
    alternatives: [
      {
        brandName: "Chocolate Lacta Ao Leite 80g",
        imageUrl: "/images/frigobar/proposta_chocolate_nestle_80g.png",
        manufacturer: "Mondelez International",
        volumeOrWeight: "Tablete 80g",
        packageType: "Embalagem azul clássica"
      }
    ],
    status: "pending",
    selectedBrandIndex: 0
  },
  {
    id: "prod_chocolate_kinder_bueno",
    productName: "Chocolate Kinder Bueno",
    category: "Petiscos",
    currentImageUrl: "/images/frigobar/chocolate_kinder_bueno.png",
    currentDiagnosis: "DEFEITUOSA: Imagem exibe wafer quebrado na mesa, sem embalagem",
    proposedBrand: {
      brandName: "Chocolate Kinder Bueno Tradicional Duplo 43g",
      imageUrl: "/images/frigobar/proposta_chocolate_kinder_bueno_43g.png",
      manufacturer: "Ferrero",
      volumeOrWeight: "Pacote Duplo 43g",
      packageType: "Flow-pack lacrado branco e vermelho com 2 barras"
    },
    alternatives: [
      {
        brandName: "Kinder Bueno White 39g",
        imageUrl: "/images/frigobar/proposta_chocolate_kinder_bueno_43g.png",
        manufacturer: "Ferrero",
        volumeOrWeight: "Pacote 39g",
        packageType: "Flow-pack branco"
      }
    ],
    status: "pending",
    selectedBrandIndex: 0
  },
  {
    id: "prod_chocolate_kitkat_snickers",
    productName: "Chocolate Kit Kat / Snickers",
    category: "Petiscos",
    currentImageUrl: "/images/frigobar/chocolate_kitkat_snickers.png",
    currentDiagnosis: "Montagem confusa misturando duas marcas rivais soltas",
    proposedBrand: {
      brandName: "Chocolate KitKat 4-Finger Milk 41.5g",
      imageUrl: "/images/frigobar/proposta_chocolate_kitkat_41g.png",
      manufacturer: "Nestlé Brasil",
      volumeOrWeight: "Flow-pack 41.5g",
      packageType: "Flow-pack vermelho oficial com 4 fingers crocantes"
    },
    alternatives: [
      {
        brandName: "Chocolate Snickers Tradicional 45g",
        imageUrl: "/images/frigobar/proposta_chocolate_kitkat_41g.png",
        manufacturer: "Mars Brasil",
        volumeOrWeight: "Barra 45g",
        packageType: "Embalagem marrom clássica com amendoim e caramelo"
      }
    ],
    status: "pending",
    selectedBrandIndex: 0
  },
  {
    id: "prod_cookies",
    productName: "Cookies",
    category: "Petiscos",
    currentImageUrl: "/images/frigobar/cookies.png",
    currentDiagnosis: "Marca fictícia gerada por IA ('GRANDMA'S OWN')",
    proposedBrand: {
      brandName: "Cookies Bauducco Tradicional Gotas de Chocolate 100g",
      imageUrl: "/images/frigobar/proposta_cookies_bauducco_100g.png",
      manufacturer: "Bauducco",
      volumeOrWeight: "Pacote 100g",
      packageType: "Pacote amarelo brilhante com gotas de chocolate"
    },
    alternatives: [
      {
        brandName: "Cookies Toddy Gotas de Chocolate 60g",
        imageUrl: "/images/frigobar/proposta_cookies_bauducco_100g.png",
        manufacturer: "PepsiCo do Brasil",
        volumeOrWeight: "Pacote 60g",
        packageType: "Pacote individual"
      }
    ],
    status: "pending",
    selectedBrandIndex: 0
  },
  {
    id: "prod_cortesia_amendoim_mendorato",
    productName: "Amendoim Mendorato (Cortesia)",
    category: "Kit Boas-Vindas",
    currentImageUrl: "/images/frigobar/proposta_amendoim_mendorato_27g.png",
    currentDiagnosis: "Novo item de cortesia exigido no Kit Boas-Vindas (fornecimento próprio hotel)",
    proposedBrand: {
      brandName: "Amendoim Dourado Japonês Mendorato 27g",
      imageUrl: "/images/frigobar/proposta_amendoim_mendorato_27g.png",
      manufacturer: "Santa Helena Alimentos",
      volumeOrWeight: "Pacote 27g",
      packageType: "Pacote metalizado dourado e verde lacrado"
    },
    alternatives: [
      {
        brandName: "Amendoim Japonês Pettiz 24g",
        imageUrl: "/images/frigobar/proposta_amendoim_mendorato_27g.png",
        manufacturer: "Dori Alimentos",
        volumeOrWeight: "Pacote 24g",
        packageType: "Pacote metalizado"
      }
    ],
    status: "pending",
    selectedBrandIndex: 0,
    isCourtesy: true
  },
  {
    id: "prod_cortesia_agua_copo",
    productName: "Água Mineral Copo (Cortesia)",
    category: "Kit Boas-Vindas",
    currentImageUrl: "/images/frigobar/proposta_agua_mineral_copo_200ml.png",
    currentDiagnosis: "Item de cortesia do Kit Boas-Vindas (estoque e repasse Anserve)",
    proposedBrand: {
      brandName: "Água Mineral Copo Selado Crystal 200ml",
      imageUrl: "/images/frigobar/proposta_agua_mineral_copo_200ml.png",
      manufacturer: "Coca-Cola FEMSA / Anserve",
      volumeOrWeight: "Copo 200ml",
      packageType: "Copo plástico selado com tampa metálica"
    },
    alternatives: [
      {
        brandName: "Água Mineral Copo Levity 200ml",
        imageUrl: "/images/frigobar/proposta_agua_mineral_copo_200ml.png",
        manufacturer: "Levity / Anserve",
        volumeOrWeight: "Copo 200ml",
        packageType: "Copo plástico selado"
      }
    ],
    status: "pending",
    selectedBrandIndex: 0,
    isCourtesy: true
  }
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
    "insights" | "catalogo" | "equipe" | "extrato"
  >("insights");
  const [insightsSubView, setInsightsSubView] = useState<
    "visao_geral" | "produtos_flats" | "perfil_hospedes"
  >("visao_geral");
  const [catalogSubView, setCatalogSubView] = useState<"produtos" | "gabarito" | "galeria_marcas">("produtos");

  // Homologation Gallery State (R1 & R2)
  const [homologationItems, setHomologationItems] = useState<BrandHomologationItem[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("corpflats_minibar_homologation_v1");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch (e) {
        console.warn("Erro ao ler homologação local:", e);
      }
    }
    return INITIAL_HOMOLOGATION_CATALOG;
  });
  const [homologationCategory, setHomologationCategory] = useState<string>("todas");
  const [homologationStatusFilter, setHomologationStatusFilter] = useState<string>("todos");
  const [homologationSearch, setHomologationSearch] = useState<string>("");
  const [zoomModalItem, setZoomModalItem] = useState<BrandHomologationItem | null>(null);
  const [swapModalItem, setSwapModalItem] = useState<BrandHomologationItem | null>(null);
  const [customSwapNotes, setCustomSwapNotes] = useState<string>("");
  const [applyingApprovedPhotos, setApplyingApprovedPhotos] = useState(false);

  const saveHomologation = (items: BrandHomologationItem[]) => {
    setHomologationItems(items);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("corpflats_minibar_homologation_v1", JSON.stringify(items));
      } catch (e) {
        console.warn("Erro ao salvar homologação local:", e);
      }
    }
  };

  const handleApprovePhoto = (id: string) => {
    const updated = homologationItems.map(item => {
      if (item.id === id) {
        const newStatus = item.status === "approved" ? "pending" : "approved";
        return { ...item, status: newStatus as any };
      }
      return item;
    });
    saveHomologation(updated);
    toast({
      title: "Homologação de Foto Atualizada! 📸",
      description: "A decisão foi gravada com sucesso."
    });
  };

  const handleApproveAllPhotos = () => {
    const updated = homologationItems.map(item => ({ ...item, status: "approved" as const }));
    saveHomologation(updated);
    toast({
      title: "Todas as Fotos Foram Homologadas! ✅",
      description: "Todas as 20 fotos comerciais de marcas reais foram aprovadas para o cardápio."
    });
  };

  const handleResetHomologation = () => {
    saveHomologation(INITIAL_HOMOLOGATION_CATALOG);
    toast({
      title: "Homologação Reiniciada",
      description: "Todos os status retornaram para pendente de conferência."
    });
  };

  const handleSelectBrandAlternative = (productId: string, altIndex: number) => {
    const updated = homologationItems.map(item => {
      if (item.id === productId) {
        return {
          ...item,
          selectedBrandIndex: altIndex,
          status: "pending" as const
        };
      }
      return item;
    });
    saveHomologation(updated);
    setSwapModalItem(null);
    toast({
      title: "Marca Alternativa Selecionada! 🔄",
      description: "A marca e foto foram atualizadas para conferência."
    });
  };

  const handleRequestCustomSwap = (productId: string, notes: string) => {
    const updated = homologationItems.map(item => {
      if (item.id === productId) {
        return {
          ...item,
          status: "swap_requested" as const,
          notes: notes.trim()
        };
      }
      return item;
    });
    saveHomologation(updated);
    setSwapModalItem(null);
    setCustomSwapNotes("");
    toast({
      title: "Troca Solicitada! 📝",
      description: "A observação foi registrada para alinhamento com a fornecedora."
    });
  };

  const handleApplyApprovedToCatalog = async () => {
    const approved = homologationItems.filter(i => i.status === "approved");
    if (approved.length === 0) {
      toast({
        title: "Nenhuma foto aprovada",
        description: "Aprove ao menos uma foto antes de aplicar ao catálogo.",
        variant: "destructive"
      });
      return;
    }
    setApplyingApprovedPhotos(true);
    try {
      let appliedCount = 0;
      for (const item of approved) {
        const matchingProduct = products.find(p => p.id === item.id);
        if (matchingProduct) {
          const activeBrand = item.selectedBrandIndex === 0
            ? item.proposedBrand
            : item.alternatives[item.selectedBrandIndex - 1] || item.proposedBrand;

          await fetch(`/api/minibar/products/${item.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              imageUrl: activeBrand.imageUrl,
              description: `${item.productName} • ${activeBrand.brandName} (${activeBrand.volumeOrWeight})`
            })
          });
          appliedCount++;
        }
      }
      await fetchProducts();
      toast({
        title: "Fotos de Marcas Reais Aplicadas! 🚀",
        description: `${appliedCount} produtos do frigobar foram atualizados com sucesso em produção.`
      });
    } catch (err: any) {
      toast({
        title: "Erro ao aplicar fotos",
        description: err.message,
        variant: "destructive"
      });
    } finally {
      setApplyingApprovedPhotos(false);
    }
  };

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

      <div className="w-full max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-3 sm:py-4 md:py-6 space-y-4 sm:space-y-5 pb-28 min-w-0 overflow-x-hidden print:hidden">
        <MinibarEcosystemNav currentScreen="admin" />

        {/* Header */}
        <div className="w-full min-w-0 bg-card border border-border p-4 sm:p-6 rounded-3xl shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-xl md:text-2xl font-black text-foreground leading-tight break-words">
                  Central Estratégica & Cardápio (CorpFlats)
                </h1>
                <Badge className="bg-primary/15 text-primary border-primary/30 text-[10px] font-bold">
                  Diretoria & Inteligência 360°
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Insights exclusivos da diretoria, cardápio e estoque padrão dos flats, controle total da equipe Anserve e repasse financeiro.
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

        {/* 4 Abas Principais Bem Divididas */}
        <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="w-full min-w-0 space-y-4">
          <TabsList className="w-full bg-muted/50 p-1.5 rounded-2xl border border-border grid grid-cols-2 lg:grid-cols-4 h-auto gap-1.5">
            <TabsTrigger value="insights" className="rounded-xl text-xs font-bold px-3 py-2.5 flex items-center justify-center gap-2 w-full">
              <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="truncate">1. Insights & Relatórios</span>
            </TabsTrigger>

            <TabsTrigger value="catalogo" className="rounded-xl text-xs font-bold px-3 py-2.5 flex items-center justify-center gap-2 w-full">
              <Package className="w-4 h-4 text-primary shrink-0" />
              <span className="truncate">2. Cardápio & Estoque Padrão</span>
            </TabsTrigger>

            <TabsTrigger value="equipe" className="rounded-xl text-xs font-bold px-3 py-2.5 flex items-center justify-center gap-2 w-full">
              <Users className="w-4 h-4 text-teal-600 shrink-0" />
              <span className="truncate">3. Equipe & Acessos Anserve</span>
            </TabsTrigger>

            <TabsTrigger value="extrato" className="rounded-xl text-xs font-bold px-3 py-2.5 flex items-center justify-center gap-2 w-full">
              <DollarSign className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="truncate">4. Repasse & QR Codes A6</span>
            </TabsTrigger>
          </TabsList>

          {/* ABA 1: INSIGHTS & RELATÓRIOS (COM SUB-FILTROS LIMPOS) */}
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

          {/* ABA 2: CARDÁPIO & ESTOQUE PADRÃO (UNIFICANDO CATÁLOGO DE PREÇOS + GABARITO POR FLAT) */}
          <TabsContent value="catalogo" className="w-full min-w-0 space-y-5">
            {/* Seletor de Sub-visão: Produtos & Preços vs Quantidade Padrão no Flat */}
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
                  onClick={() => setCatalogSubView("galeria_marcas")}
                  className={`px-4 py-2 rounded-2xl text-xs font-black transition-all flex items-center gap-2 ${
                    catalogSubView === "galeria_marcas"
                      ? "bg-amber-600 text-white shadow-sm"
                      : "bg-muted/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Camera className="w-4 h-4" />
                  <span>Validação & Homologação de Marcas ({homologationItems.filter(i => i.status === "approved").length}/{homologationItems.length})</span>
                  {homologationItems.some(i => i.status === "pending") && (
                    <Badge className="bg-amber-400 text-slate-950 font-black text-[9px] px-1.5 py-0.5 rounded-full ml-1">
                      {homologationItems.filter(i => i.status === "pending").length} pendentes
                    </Badge>
                  )}
                </button>
              </div>

              {catalogSubView === "produtos" && (
                <Button
                  size="sm"
                  onClick={() => handleOpenProductModal()}
                  className="rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 h-9"
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Novo Produto no Cardápio
                </Button>
              )}

              {catalogSubView === "galeria_marcas" && (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleApproveAllPhotos}
                    className="rounded-xl text-xs font-bold border-emerald-600/40 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 h-9"
                  >
                    <CheckCheck className="w-3.5 h-3.5 mr-1.5" />
                    Aprovar Todas as Fotos
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleApplyApprovedToCatalog}
                    disabled={applyingApprovedPhotos || homologationItems.filter(i => i.status === "approved").length === 0}
                    className="rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white h-9"
                  >
                    <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                    {applyingApprovedPhotos ? "Aplicando..." : "Aplicar Fotos ao Cardápio"}
                  </Button>
                </div>
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
                            <span className="text-[10px] text-muted-foreground block">Custo Repasse Anserve:</span>
                            <span className="text-xs font-mono font-semibold text-muted-foreground">
                              R$ {Number(p.cost || 0).toFixed(2)}
                            </span>
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
              </div>
            ) : (
              /* SUB-VISÃO 3: GALERIA DE VALIDAÇÃO E HOMOLOGAÇÃO DE MARCAS REAIS (R1 & R2) */
              <div className="space-y-5 w-full min-w-0">
                {/* Banner de Controle e Status */}
                <div className="bg-gradient-to-r from-slate-900 via-amber-950/40 to-slate-900 border border-amber-500/30 p-5 rounded-3xl shadow-sm text-foreground space-y-4">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className="bg-amber-400 text-slate-950 font-black text-[10px]">
                          📸 REQUISITOS R1 & R2 • PADRONIZAÇÃO VISUAL
                        </Badge>
                        <Badge variant="outline" className="text-amber-500 border-amber-500/40 font-bold text-[10px]">
                          Padrão #FFFFFF Puro • 1:1 Quadrado • Estúdio 5500K
                        </Badge>
                      </div>
                      <h3 className="text-base sm:text-lg font-black tracking-tight text-foreground">
                        Galeria de Homologação e Pré-Aprovação de Marcas Comerciais Reais
                      </h3>
                      <p className="text-xs text-muted-foreground max-w-3xl">
                        Todas as fotos do frigobar foram padronizadas e mapeadas para marcas comerciais reais e consagradas.
                        Valide lado a lado cada foto com seu modelo legado, selecione marcas alternativas caso necessário e aprove individualmente ou em lote antes da publicação definitiva no cardápio do hóspede.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleResetHomologation}
                        className="rounded-xl text-xs font-bold h-9"
                      >
                        <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                        Restaurar Padrões
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleApproveAllPhotos}
                        className="rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white h-9"
                      >
                        <CheckCheck className="w-3.5 h-3.5 mr-1.5" />
                        Aprovar Todas as Fotos ({homologationItems.length})
                      </Button>
                    </div>
                  </div>

                  {/* Barra de Progresso e Métricas */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-border/60">
                    <div className="bg-card/70 border border-border p-3 rounded-2xl">
                      <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">Total Mapeado</span>
                      <strong className="text-lg font-black text-foreground">{homologationItems.length} itens</strong>
                    </div>
                    <div className="bg-emerald-500/10 border border-emerald-500/30 p-3 rounded-2xl">
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider block">Aprovadas</span>
                      <strong className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                        {homologationItems.filter(i => i.status === "approved").length} itens
                      </strong>
                    </div>
                    <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-2xl">
                      <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold uppercase tracking-wider block">Pendentes</span>
                      <strong className="text-lg font-black text-amber-600 dark:text-amber-400">
                        {homologationItems.filter(i => i.status === "pending").length} itens
                      </strong>
                    </div>
                    <div className="bg-sky-500/10 border border-sky-500/30 p-3 rounded-2xl">
                      <span className="text-[10px] text-sky-600 dark:text-sky-400 font-bold uppercase tracking-wider block">Troca Solicitada</span>
                      <strong className="text-lg font-black text-sky-600 dark:text-sky-400">
                        {homologationItems.filter(i => i.status === "swap_requested").length} itens
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Filtros e Busca */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      size="sm"
                      variant={homologationCategory === "todas" ? "default" : "outline"}
                      onClick={() => setHomologationCategory("todas")}
                      className="h-8 rounded-xl text-xs font-bold"
                    >
                      Todas as Categorias ({homologationItems.length})
                    </Button>
                    <Button
                      size="sm"
                      variant={homologationCategory === "Bebidas" ? "default" : "outline"}
                      onClick={() => setHomologationCategory("Bebidas")}
                      className="h-8 rounded-xl text-xs font-bold"
                    >
                      Bebidas ({homologationItems.filter(i => i.category === "Bebidas").length})
                    </Button>
                    <Button
                      size="sm"
                      variant={homologationCategory === "Petiscos" ? "default" : "outline"}
                      onClick={() => setHomologationCategory("Petiscos")}
                      className="h-8 rounded-xl text-xs font-bold"
                    >
                      Petiscos ({homologationItems.filter(i => i.category === "Petiscos").length})
                    </Button>
                    <Button
                      size="sm"
                      variant={homologationCategory === "Kit Boas-Vindas" ? "default" : "outline"}
                      onClick={() => setHomologationCategory("Kit Boas-Vindas")}
                      className="h-8 rounded-xl text-xs font-bold"
                    >
                      Kit Boas-Vindas ({homologationItems.filter(i => i.category === "Kit Boas-Vindas").length})
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={homologationStatusFilter}
                      onChange={e => setHomologationStatusFilter(e.target.value)}
                      className="h-8 text-xs rounded-xl border border-input bg-background px-2.5 font-bold"
                    >
                      <option value="todos">Todos os Status</option>
                      <option value="approved">✅ Aprovados</option>
                      <option value="pending">⏳ Pendentes</option>
                      <option value="swap_requested">🔄 Troca Solicitada</option>
                    </select>

                    <div className="relative w-full sm:w-56">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Buscar marca ou produto..."
                        value={homologationSearch}
                        onChange={e => setHomologationSearch(e.target.value)}
                        className="h-8 pl-9 text-xs rounded-xl"
                      />
                    </div>
                  </div>
                </div>

                {/* Grid Comparativo dos Produtos (Lado a Lado) */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 w-full min-w-0">
                  {homologationItems
                    .filter(item => {
                      if (homologationCategory !== "todas" && item.category !== homologationCategory) return false;
                      if (homologationStatusFilter !== "todos" && item.status !== homologationStatusFilter) return false;
                      if (homologationSearch.trim()) {
                        const term = homologationSearch.toLowerCase();
                        const activeBrand = item.selectedBrandIndex === 0 ? item.proposedBrand : item.alternatives[item.selectedBrandIndex - 1] || item.proposedBrand;
                        const matchName = item.productName.toLowerCase().includes(term);
                        const matchBrand = activeBrand.brandName.toLowerCase().includes(term);
                        const matchMfr = activeBrand.manufacturer.toLowerCase().includes(term);
                        return matchName || matchBrand || matchMfr;
                      }
                      return true;
                    })
                    .map(item => {
                      const activeBrand = item.selectedBrandIndex === 0
                        ? item.proposedBrand
                        : item.alternatives[item.selectedBrandIndex - 1] || item.proposedBrand;
                      const isApproved = item.status === "approved";
                      const isSwap = item.status === "swap_requested";

                      return (
                        <Card
                          key={item.id}
                          className={`rounded-3xl border transition-all p-4 space-y-4 shadow-sm w-full min-w-0 ${
                            isApproved
                              ? "border-emerald-500/40 bg-card hover:border-emerald-500/60"
                              : isSwap
                              ? "border-sky-500/40 bg-card hover:border-sky-500/60"
                              : "border-border bg-card hover:border-border/80"
                          }`}
                        >
                          {/* Cabeçalho do Card */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <strong className="text-sm sm:text-base font-black text-foreground">
                                  {item.productName}
                                </strong>
                                <Badge variant="outline" className="text-[10px] font-bold">
                                  {item.category}
                                </Badge>
                                {item.isCourtesy && (
                                  <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 text-[9px] font-bold">
                                    Cortesia Kit Boas-Vindas
                                  </Badge>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground block truncate">
                                SKU: <code className="font-mono text-[11px]">{item.id}</code>
                              </span>
                            </div>

                            {/* Badge de Status */}
                            {isApproved ? (
                              <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] font-bold shrink-0">
                                <Check className="w-3 h-3 mr-1" /> Aprovado para Produção
                              </Badge>
                            ) : isSwap ? (
                              <Badge className="bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30 text-[10px] font-bold shrink-0">
                                <RotateCcw className="w-3 h-3 mr-1" /> Troca Solicitada
                              </Badge>
                            ) : (
                              <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px] font-bold shrink-0">
                                <Clock className="w-3 h-3 mr-1" /> Aguardando Homologação
                              </Badge>
                            )}
                          </div>

                          {/* Comparação Lado a Lado (Legado vs Proposta Real) */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-stretch">
                            {/* Coluna Esquerda: Foto Legada */}
                            <div className="bg-muted/30 border border-border/80 rounded-2xl p-3 flex flex-col justify-between space-y-2.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                                  <span className="text-rose-500">❌</span> Foto Atual (Legado)
                                </span>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => setZoomModalItem(item)}
                                  className="h-6 w-6 rounded-lg text-muted-foreground hover:text-foreground"
                                  title="Ver em tela cheia"
                                >
                                  <ZoomIn className="w-3.5 h-3.5" />
                                </Button>
                              </div>

                              <div className="w-full aspect-square rounded-xl bg-white border border-border/50 flex items-center justify-center p-2 overflow-hidden shadow-inner">
                                <img
                                  src={item.currentImageUrl}
                                  alt={`Legado ${item.productName}`}
                                  className="w-full h-full object-contain"
                                />
                              </div>

                              <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-700 dark:text-rose-300">
                                <strong>Diagnóstico:</strong> {item.currentDiagnosis}
                              </div>
                            </div>

                            {/* Coluna Direita: Foto Proposta (Marca Real) */}
                            <div className="bg-emerald-500/5 border-2 border-emerald-500/30 rounded-2xl p-3 flex flex-col justify-between space-y-2.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                  <span className="text-emerald-500">✨</span> Proposta (Marca Real)
                                </span>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => setZoomModalItem(item)}
                                  className="h-6 w-6 rounded-lg text-emerald-600 hover:text-emerald-700"
                                  title="Inspecionar 1024x1024"
                                >
                                  <ZoomIn className="w-3.5 h-3.5" />
                                </Button>
                              </div>

                              <div
                                className="w-full aspect-square rounded-xl bg-white border border-emerald-500/20 flex items-center justify-center p-2 overflow-hidden shadow-xs relative group cursor-pointer"
                                onClick={() => setZoomModalItem(item)}
                              >
                                <img
                                  src={activeBrand.imageUrl}
                                  alt={activeBrand.brandName}
                                  className="w-full h-full object-contain"
                                />
                                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl">
                                  <span className="bg-slate-900/90 text-white text-[10px] font-bold px-2 py-1 rounded-lg flex items-center gap-1">
                                    <ZoomIn className="w-3 h-3" /> Ampliar 1024x1024
                                  </span>
                                </div>
                              </div>

                              <div className="p-2.5 rounded-xl bg-card border border-border space-y-1 text-xs">
                                <div className="font-black text-foreground text-xs leading-tight">
                                  {activeBrand.brandName}
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                  Fabricante: <strong className="text-foreground">{activeBrand.manufacturer}</strong>
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                  Embalagem: <span>{activeBrand.packageType} ({activeBrand.volumeOrWeight})</span>
                                </div>
                                <div className="pt-1 flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                                  <span>✓ Fundo #FFFFFF</span>
                                  <span>• 1:1 Estúdio 5500K</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Seletor de Alternativas de Marca */}
                          {item.alternatives.length > 0 && (
                            <div className="flex items-center justify-between gap-2 p-2.5 rounded-2xl bg-muted/40 border border-border text-xs">
                              <span className="text-[11px] text-muted-foreground font-semibold">
                                Alternativas de Fornecedor:
                              </span>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => handleSelectBrandAlternative(item.id, 0)}
                                  className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all ${
                                    item.selectedBrandIndex === 0
                                      ? "bg-primary text-primary-foreground shadow-xs"
                                      : "bg-background border border-border text-muted-foreground hover:text-foreground"
                                  }`}
                                >
                                  {item.proposedBrand.brandName.split(" ")[0]} (Padrão)
                                </button>
                                {item.alternatives.map((alt, idx) => (
                                  <button
                                    key={alt.brandName}
                                    type="button"
                                    onClick={() => handleSelectBrandAlternative(item.id, idx + 1)}
                                    className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all ${
                                      item.selectedBrandIndex === idx + 1
                                        ? "bg-primary text-primary-foreground shadow-xs"
                                        : "bg-background border border-border text-muted-foreground hover:text-foreground"
                                    }`}
                                  >
                                    {alt.brandName.split(" ")[0]}
                                  </button>
                                ))}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setSwapModalItem(item)}
                                  className="h-6 text-[10px] font-bold text-muted-foreground hover:text-foreground px-2 rounded-lg"
                                >
                                  Mais...
                                </Button>
                              </div>
                            </div>
                          )}

                          {/* Observações de Troca */}
                          {item.notes && (
                            <div className="p-2.5 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-xs text-sky-700 dark:text-sky-300">
                              <strong>Observação de Troca:</strong> {item.notes}
                            </div>
                          )}

                          {/* Rodapé com Botões de Ação */}
                          <div className="flex items-center justify-between pt-2 border-t border-border gap-2">
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleApprovePhoto(item.id)}
                                className={`rounded-xl text-xs font-bold h-9 transition-all ${
                                  isApproved
                                    ? "bg-muted text-muted-foreground hover:text-foreground border border-border"
                                    : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                                }`}
                              >
                                {isApproved ? (
                                  <>
                                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                                    Desfazer Aprovação
                                  </>
                                ) : (
                                  <>
                                    <Check className="w-3.5 h-3.5 mr-1.5" />
                                    Aprovar Foto
                                  </>
                                )}
                              </Button>

                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setSwapModalItem(item)}
                                className="rounded-xl text-xs font-bold h-9"
                              >
                                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                                Trocar Marca...
                              </Button>
                            </div>

                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setZoomModalItem(item)}
                              className="rounded-xl text-xs font-bold text-muted-foreground hover:text-foreground h-9"
                            >
                              <ZoomIn className="w-3.5 h-3.5 mr-1.5" />
                              Zoom HD
                            </Button>
                          </div>
                        </Card>
                      );
                    })}
                </div>
              </div>
            )}
          </TabsContent>

          {/* ABA 3: EQUIPE & ACESSOS ANSERVE (GESTORES, REPOSITORAS, FATURAMENTO & WHATSAPP DE TRABALHO) */}
          <TabsContent value="equipe" className="w-full min-w-0 space-y-5">
            <div className="bg-card border border-border p-4 sm:p-5 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full min-w-0">
              <div className="space-y-1 min-w-0">
                <h3 className="text-sm sm:text-base font-black text-foreground flex items-center gap-2">
                  <Users className="w-5 h-5 text-teal-600 shrink-0" />
                  <span>Gestão Geral da Equipe Anserve (Gestores, Repositoras & Faturamento NF)</span>
                </h3>
                <p className="text-xs text-muted-foreground">
                  Gerencie todos os logins da operação Anserve. Ao cadastrar com WhatsApp, o colaborador recebe automaticamente o link direto, login e senha inicial.
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
                  <span>Novo Gestor</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleOpenCreateStaff("anserve_faturamento")}
                  className="rounded-xl text-xs font-bold h-9 gap-1.5 border-indigo-500/40 text-indigo-700 dark:text-indigo-300 w-full sm:w-auto"
                >
                  <Plus className="w-4 h-4" />
                  <span>Novo Emissor NF</span>
                </Button>
                <Button
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
                { key: "todos", label: `Todos (${staffList.length})` },
                {
                  key: "anserve_gestor",
                  label: `Gestores (${staffList.filter(s => s.role === "anserve_gestor").length})`
                },
                {
                  key: "anserve_repositora",
                  label: `Repositoras (${staffList.filter(s => s.role === "anserve_repositora").length})`
                },
                {
                  key: "anserve_faturamento",
                  label: `Emissão de NF (${staffList.filter(s => s.role === "anserve_faturamento").length})`
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

          {/* ABA 4: REPASSE & QR CODES A6 */}
          <TabsContent value="extrato" className="space-y-6">
            {/* Bloco 1: Extrato CorpFlats <-> Anserve */}
            {settlementData && (
              <div className="space-y-3">
                <h3 className="text-sm font-black text-foreground flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  <span>Fechamento Financeiro de Repasse (CorpFlats ↔ Anserve)</span>
                </h3>
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
                      + R$ {Number(settlementData.courtesyWaterTotalCost ?? settlementData.courtesySummary?.courtesyWaterTotalCost ?? settlementData.courtesyRestockCost ?? 0).toFixed(2)} reembolsados em águas Anserve
                    </span>
                  </Card>
                </div>

                {/* R6: Apuração de Fornecedores do Kit de Boas-Vindas */}
                <div className="p-3.5 rounded-2xl bg-muted/40 border border-border text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-foreground flex items-center gap-1.5">
                      <Gift className="w-3.5 h-3.5 text-sky-600" />
                      <span>Kit de Boas-Vindas (Origem dos Fornecedores & Repasse)</span>
                    </span>
                    <Badge variant="outline" className="text-[10px] bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30">
                      Reembolso Água Anserve: R$ {Number(settlementData.courtesyWaterTotalCost ?? settlementData.courtesySummary?.courtesyWaterTotalCost ?? 0).toFixed(2)}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2.5 rounded-xl bg-card border border-border flex items-center justify-between">
                      <div>
                        <span className="font-bold text-foreground block">💧 Copos d'Água Mineral 200ml</span>
                        <span className="text-muted-foreground block text-[10px]">Fornecedor: Anserve • Custo unitário R$ 2,00</span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold block text-foreground">{settlementData.courtesyWaterCupsTotal ?? settlementData.courtesySummary?.totalCourtesyWaterCups ?? 0} un. consumidas</span>
                        <strong className="text-sky-600 font-mono">+ R$ {Number(settlementData.courtesyWaterTotalCost ?? settlementData.courtesySummary?.courtesyWaterTotalCost ?? 0).toFixed(2)}</strong>
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-card border border-border flex items-center justify-between">
                      <div>
                        <span className="font-bold text-foreground block">🥜 Amendoim Mendorato 27g</span>
                        <span className="text-amber-600 dark:text-amber-400 font-semibold block text-[10px]">Fornecedor: Hotel Próprio (CorpFlats)</span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold block text-foreground">{settlementData.courtesyMendoratoPeanutsTotal ?? settlementData.courtesySummary?.totalCourtesyMendoratoPeanuts ?? 0} un. consumidas</span>
                        <strong className="text-muted-foreground font-mono">R$ 0,00 (Isento de Repasse)</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Bloco 2: Displays de Acrílico A6 com QR Code por Flat */}
            <div className="space-y-4 pt-2 border-t border-border">
              <div className="bg-card border border-border p-4 md:p-5 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-sm sm:text-base font-black text-foreground flex items-center gap-2">
                    <QrCode className="w-5 h-5 text-indigo-600" />
                    <span>Displays de Acrílico A6 por Flat (Cardápio Digital & Extrato)</span>
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Cada cartão aponta diretamente para o Cardápio Digital e Extrato do respectivo flat. Imprima em formato A6 para os displays de balcão.
                  </p>
                </div>

                <Button
                  size="sm"
                  onClick={handlePrintAllQrCodes}
                  className="rounded-2xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white h-9 px-4 shadow-sm shrink-0"
                >
                  <Printer className="w-4 h-4 mr-1.5" />
                  Imprimir Todos os Displays (A6)
                </Button>
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
                        <p className="font-bold text-foreground">Cardápio Digital & Extrato</p>
                        <p className="text-[10px]">Aponte a câmera para consultar preços e acompanhar seu consumo!</p>
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
            </div>
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
                  <option value="anserve_repositora">🧹 Funcionária de Reposição & Conferência (/frigobar-reposicao)</option>
                  <option value="anserve_faturamento">📄 Emissão de Notas Fiscais (/frigobar-notas)</option>
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

        {/* MODAL DE ZOOM E INSPEÇÃO HD DE FOTOS (R1 & R2) */}
        <Dialog open={!!zoomModalItem} onOpenChange={() => setZoomModalItem(null)}>
          <DialogContent className="max-w-4xl p-6 rounded-3xl">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Badge className="bg-amber-400 text-slate-950 font-black text-[10px]">
                  🔍 INSPEÇÃO DE PADRONIZAÇÃO VISUAL (1024x1024)
                </Badge>
                {zoomModalItem?.isCourtesy && (
                  <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 text-[10px] font-bold">
                    Cortesia Kit Boas-Vindas
                  </Badge>
                )}
              </div>
              <DialogTitle className="text-lg font-black text-foreground flex items-center justify-between">
                <span>{zoomModalItem?.productName} • Comparação Lado a Lado</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Audite a qualidade fotográfica, acabamento de estúdio e nitidez da embalagem comercial real.
              </DialogDescription>
            </DialogHeader>

            {zoomModalItem && (() => {
              const activeBrand = zoomModalItem.selectedBrandIndex === 0
                ? zoomModalItem.proposedBrand
                : zoomModalItem.alternatives[zoomModalItem.selectedBrandIndex - 1] || zoomModalItem.proposedBrand;
              const isApproved = zoomModalItem.status === "approved";

              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Legado */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-rose-500 flex items-center gap-1">
                          ❌ Foto Legada (IA / Genérica)
                        </span>
                        <span className="text-[10px] text-muted-foreground">Resolução 1024x1024</span>
                      </div>
                      <div className="w-full aspect-square rounded-2xl bg-white border border-border p-3 flex items-center justify-center shadow-inner">
                        <img
                          src={zoomModalItem.currentImageUrl}
                          alt="Legado"
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-700 dark:text-rose-300">
                        <strong>Problema Detectado:</strong> {zoomModalItem.currentDiagnosis}
                      </div>
                    </div>

                    {/* Proposta Marca Real */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          ✨ Nova Foto Comercial (Marca Real)
                        </span>
                        <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[9px] font-bold">
                          Fundo #FFFFFF Puro
                        </Badge>
                      </div>
                      <div className="w-full aspect-square rounded-2xl bg-white border-2 border-emerald-500/30 p-3 flex items-center justify-center shadow-sm">
                        <img
                          src={activeBrand.imageUrl}
                          alt={activeBrand.brandName}
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <div className="p-2.5 rounded-xl bg-card border border-border text-xs space-y-1">
                        <div className="font-black text-sm text-foreground">{activeBrand.brandName}</div>
                        <div className="text-muted-foreground">
                          Fabricante: <strong className="text-foreground">{activeBrand.manufacturer}</strong> • Embalagem: {activeBrand.packageType} ({activeBrand.volumeOrWeight})
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Checklist de Validação Visual */}
                  <div className="p-3.5 rounded-2xl bg-muted/40 border border-border space-y-2">
                    <span className="text-xs font-black text-foreground uppercase tracking-wider block">
                      Checklist Técnico de Padronização CorpFlats
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                      <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                        <Check className="w-4 h-4 shrink-0" />
                        <span>Fundo Branco Puro (#FFFFFF)</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                        <Check className="w-4 h-4 shrink-0" />
                        <span>Proporção 1:1 Quadrada</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                        <Check className="w-4 h-4 shrink-0" />
                        <span>Iluminação Balanceada 5500K</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                        <Check className="w-4 h-4 shrink-0" />
                        <span>Ângulo Frontal Superior 10°-15°</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                        <Check className="w-4 h-4 shrink-0" />
                        <span>Sombra de Contato Suave</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                        <Check className="w-4 h-4 shrink-0" />
                        <span>Marca Comercial Autêntica</span>
                      </div>
                    </div>
                  </div>

                  <DialogFooter className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-2">
                    <Button
                      variant="outline"
                      onClick={() => setZoomModalItem(null)}
                      className="rounded-xl text-xs font-bold"
                    >
                      Fechar
                    </Button>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          const item = zoomModalItem;
                          setZoomModalItem(null);
                          setSwapModalItem(item);
                        }}
                        className="rounded-xl text-xs font-bold"
                      >
                        <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                        Trocar Marca...
                      </Button>
                      <Button
                        onClick={() => {
                          handleApprovePhoto(zoomModalItem.id);
                          setZoomModalItem(null);
                        }}
                        className={`rounded-xl text-xs font-bold ${
                          isApproved
                            ? "bg-muted text-muted-foreground hover:text-foreground"
                            : "bg-emerald-600 hover:bg-emerald-700 text-white"
                        }`}
                      >
                        {isApproved ? (
                          <>
                            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                            Desfazer Aprovação
                          </>
                        ) : (
                          <>
                            <Check className="w-3.5 h-3.5 mr-1.5" />
                            Aprovar Esta Foto
                          </>
                        )}
                      </Button>
                    </div>
                  </DialogFooter>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* MODAL DE TROCA DE MARCA / FORNECEDOR ALTERNATIVO (R2) */}
        <Dialog open={!!swapModalItem} onOpenChange={() => setSwapModalItem(null)}>
          <DialogContent className="max-w-lg p-5 rounded-3xl">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Badge className="bg-sky-500/15 text-sky-600 border-sky-500/30 font-bold text-[10px]">
                  🔄 SELETOR DE MARCA & FORNECEDOR
                </Badge>
              </div>
              <DialogTitle className="text-base font-black text-foreground">
                Trocar Marca de: {swapModalItem?.productName}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Selecione uma marca alternativa homologada ou solicite uma marca personalizada para alinhamento com a fornecedora.
              </DialogDescription>
            </DialogHeader>

            {swapModalItem && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <span className="text-xs font-bold text-foreground">Marcas Comerciais Disponíveis:</span>
                  <div className="space-y-2">
                    {/* Opção Padrão */}
                    <div
                      onClick={() => handleSelectBrandAlternative(swapModalItem.id, 0)}
                      className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        swapModalItem.selectedBrandIndex === 0
                          ? "border-primary bg-primary/5 shadow-xs"
                          : "border-border hover:border-border/80 bg-card"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={swapModalItem.proposedBrand.imageUrl}
                          alt={swapModalItem.proposedBrand.brandName}
                          className="w-10 h-10 rounded-xl bg-white object-contain border p-1"
                        />
                        <div>
                          <div className="font-bold text-xs text-foreground">
                            {swapModalItem.proposedBrand.brandName} (Padrão)
                          </div>
                          <span className="text-[11px] text-muted-foreground">
                            {swapModalItem.proposedBrand.manufacturer} • {swapModalItem.proposedBrand.volumeOrWeight}
                          </span>
                        </div>
                      </div>
                      {swapModalItem.selectedBrandIndex === 0 && (
                        <Check className="w-4 h-4 text-primary shrink-0" />
                      )}
                    </div>

                    {/* Alternativas Cadastradas */}
                    {swapModalItem.alternatives.map((alt, idx) => (
                      <div
                        key={alt.brandName}
                        onClick={() => handleSelectBrandAlternative(swapModalItem.id, idx + 1)}
                        className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                          swapModalItem.selectedBrandIndex === idx + 1
                            ? "border-primary bg-primary/5 shadow-xs"
                            : "border-border hover:border-border/80 bg-card"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <img
                            src={alt.imageUrl}
                            alt={alt.brandName}
                            className="w-10 h-10 rounded-xl bg-white object-contain border p-1"
                          />
                          <div>
                            <div className="font-bold text-xs text-foreground">{alt.brandName}</div>
                            <span className="text-[11px] text-muted-foreground">
                              {alt.manufacturer} • {alt.volumeOrWeight}
                            </span>
                          </div>
                        </div>
                        {swapModalItem.selectedBrandIndex === idx + 1 && (
                          <Check className="w-4 h-4 text-primary shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-border">
                  <Label className="text-xs font-bold text-foreground">
                    Ou Solicite Outra Marca Específica:
                  </Label>
                  <Input
                    placeholder="Ex: Preferimos Heineken 0.0 sem álcool ou Stella Pure Gold..."
                    value={customSwapNotes}
                    onChange={e => setCustomSwapNotes(e.target.value)}
                    className="h-9 text-xs rounded-xl"
                  />
                  <span className="text-[10px] text-muted-foreground block">
                    Ao registrar observação, o status mudará para "Troca Solicitada".
                  </span>
                </div>

                <DialogFooter className="pt-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSwapModalItem(null);
                      setCustomSwapNotes("");
                    }}
                    className="rounded-xl text-xs font-bold"
                  >
                    Fechar
                  </Button>
                  {customSwapNotes.trim() && (
                    <Button
                      onClick={() => handleRequestCustomSwap(swapModalItem.id, customSwapNotes)}
                      className="rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white"
                    >
                      Gravar Solicitação de Troca
                    </Button>
                  )}
                </DialogFooter>
              </div>
            )}
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
