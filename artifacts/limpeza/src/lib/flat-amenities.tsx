import React from "react";
import {
  Bed, BedDouble, Sofa, Crown, Layers, Baby, PlusCircle, DoorClosed, Bath, LayoutGrid, User, Users,
  Wind, AirVent, Fan, Flame, Sun, Sunset, Building, Home, VolumeX, Eye, Mountain, Trees, Moon,
  Microwave, Box, Refrigerator, CookingPot, Coffee, Utensils, Zap, Droplet, UtensilsCrossed, WashingMachine, Shirt,
  Wifi, Briefcase, Armchair, Tv, Cast, KeyRound, Key, ShieldCheck,
  Car, ParkingCircle, Slash, Accessibility, ArrowUpDown, Footprints, Shield, Lock, Waves, Dumbbell, Laptop,
  PawPrint, Ban, CigaretteOff, Cigarette, Smile, Building2, Compass, CalendarCheck,
  Sparkles, Gem, Tag, Wrench, Plug2, PaintRoller, BedSingle, ClipboardCheck, SprayCan, CheckCircle2, Hammer, UserCheck, PowerOff
} from "lucide-react";

export interface FlatAmenityDefinition {
  id: string;
  label: string;
  iconName: string;
  category: "camas" | "climatizacao" | "cozinha" | "tecnologia" | "predio" | "regras" | "status";
  categoryLabel: string;
  colorClass?: string;
  isStandardDefault?: boolean;
}

export const AMENITY_CATEGORIES = [
  { id: "all", label: "Todas as Tags" },
  { id: "camas", label: "1. Camas & Espaço" },
  { id: "climatizacao", label: "2. Climatização & Ambiente" },
  { id: "cozinha", label: "3. Cozinha & Eletros" },
  { id: "tecnologia", label: "4. Tecnologia & Trabalho" },
  { id: "predio", label: "5. Garagem & Prédio" },
  { id: "regras", label: "6. Políticas & Regras" },
  { id: "status", label: "7. Status & Manutenção" },
] as const;

export const FLAT_AMENITIES_CATALOG: FlatAmenityDefinition[] = [
  // ── 1. Configuração de Camas, Espaço & Capacidade ───────────────────────────
  { id: "cama_casal", label: "Cama de Casal", iconName: "Bed", category: "camas", categoryLabel: "Camas & Espaço", isStandardDefault: true },
  { id: "2_camas_solteiro", label: "2 Camas de Solteiro", iconName: "BedDouble", category: "camas", categoryLabel: "Camas & Espaço", isStandardDefault: true },
  { id: "sofa_cama", label: "Sofá-Cama", iconName: "Sofa", category: "camas", categoryLabel: "Camas & Espaço" },
  { id: "cama_king", label: "Cama King / Queen", iconName: "Crown", category: "camas", categoryLabel: "Camas & Espaço" },
  { id: "beliche", label: "Beliche", iconName: "Layers", category: "camas", categoryLabel: "Camas & Espaço" },
  { id: "berco_infantil", label: "Berço / Infantil", iconName: "Baby", category: "camas", categoryLabel: "Camas & Espaço" },
  { id: "cama_auxiliar", label: "Cama Auxiliar / Extra", iconName: "PlusCircle", category: "camas", categoryLabel: "Camas & Espaço" },
  { id: "quarto_separado", label: "Quarto Separado", iconName: "DoorClosed", category: "camas", categoryLabel: "Camas & Espaço" },
  { id: "suite", label: "Suíte", iconName: "Bath", category: "camas", categoryLabel: "Camas & Espaço" },
  { id: "estudio_loft", label: "Estúdio / Loft Aberto", iconName: "LayoutGrid", category: "camas", categoryLabel: "Camas & Espaço" },
  { id: "cap_1", label: "Capacidade 1 Pessoa", iconName: "User", category: "camas", categoryLabel: "Camas & Espaço" },
  { id: "cap_2", label: "Capacidade 2 Pessoas", iconName: "Users", category: "camas", categoryLabel: "Camas & Espaço" },
  { id: "cap_3", label: "Capacidade 3 Pessoas", iconName: "Users", category: "camas", categoryLabel: "Camas & Espaço" },
  { id: "cap_4_plus", label: "Capacidade 4+ Pessoas", iconName: "Users", category: "camas", categoryLabel: "Camas & Espaço" },

  // ── 2. Climatização, Posição & Ambiente ──────────────────────────────────────
  { id: "ar_split", label: "Ar Split", iconName: "Wind", category: "climatizacao", categoryLabel: "Climatização & Ambiente", colorClass: "text-sky-500", isStandardDefault: true },
  { id: "ar_janela", label: "Ar Janela", iconName: "AirVent", category: "climatizacao", categoryLabel: "Climatização & Ambiente", colorClass: "text-teal-500", isStandardDefault: true },
  { id: "ventilador_teto", label: "Ventilador de Teto", iconName: "Fan", category: "climatizacao", categoryLabel: "Climatização & Ambiente" },
  { id: "aquecedor", label: "Aquecedor", iconName: "Flame", category: "climatizacao", categoryLabel: "Climatização & Ambiente", colorClass: "text-amber-500" },
  { id: "sol_manha", label: "Sol da Manhã", iconName: "Sun", category: "climatizacao", categoryLabel: "Climatização & Ambiente", colorClass: "text-amber-400" },
  { id: "sol_tarde", label: "Sol da Tarde", iconName: "Sunset", category: "climatizacao", categoryLabel: "Climatização & Ambiente", colorClass: "text-orange-500" },
  { id: "andar_alto", label: "Andar Alto", iconName: "Building", category: "climatizacao", categoryLabel: "Climatização & Ambiente", isStandardDefault: true },
  { id: "andar_baixo", label: "Andar Baixo / Térreo", iconName: "Home", category: "climatizacao", categoryLabel: "Climatização & Ambiente", isStandardDefault: true },
  { id: "silencioso_fundos", label: "Silencioso / Fundos", iconName: "VolumeX", category: "climatizacao", categoryLabel: "Climatização & Ambiente" },
  { id: "frente_rua", label: "Frente / Vista Rua", iconName: "Eye", category: "climatizacao", categoryLabel: "Climatização & Ambiente" },
  { id: "vista_livre", label: "Vista Livre / Panorâmica", iconName: "Mountain", category: "climatizacao", categoryLabel: "Climatização & Ambiente", colorClass: "text-emerald-500", isStandardDefault: true },
  { id: "varanda_sacada", label: "Varanda / Sacada", iconName: "Trees", category: "climatizacao", categoryLabel: "Climatização & Ambiente", colorClass: "text-emerald-600", isStandardDefault: true },
  { id: "cortina_blackout", label: "Cortina Blackout", iconName: "Moon", category: "climatizacao", categoryLabel: "Climatização & Ambiente", colorClass: "text-indigo-400" },

  // ── 3. Cozinha, Eletrodomésticos & Utensílios ───────────────────────────────
  { id: "microondas", label: "Micro-ondas", iconName: "Microwave", category: "cozinha", categoryLabel: "Cozinha & Eletros", colorClass: "text-amber-500", isStandardDefault: true },
  { id: "frigobar", label: "Frigobar", iconName: "Box", category: "cozinha", categoryLabel: "Cozinha & Eletros", colorClass: "text-blue-400", isStandardDefault: true },
  { id: "geladeira_duplex", label: "Geladeira Duplex / Frost Free", iconName: "Refrigerator", category: "cozinha", categoryLabel: "Cozinha & Eletros", colorClass: "text-blue-500" },
  { id: "fogao_cooktop", label: "Fogão / Cooktop", iconName: "CookingPot", category: "cozinha", categoryLabel: "Cozinha & Eletros", colorClass: "text-orange-500" },
  { id: "forno", label: "Forno Elétrico / a Gás", iconName: "Flame", category: "cozinha", categoryLabel: "Cozinha & Eletros" },
  { id: "cafeteira", label: "Cafeteira", iconName: "Coffee", category: "cozinha", categoryLabel: "Cozinha & Eletros", colorClass: "text-amber-700", isStandardDefault: true },
  { id: "sanduicheira", label: "Sanduicheira / Grill", iconName: "Utensils", category: "cozinha", categoryLabel: "Cozinha & Eletros" },
  { id: "air_fryer", label: "Air Fryer", iconName: "Zap", category: "cozinha", categoryLabel: "Cozinha & Eletros" },
  { id: "liquidificador", label: "Liquidificador", iconName: "UtensilsCrossed", category: "cozinha", categoryLabel: "Cozinha & Eletros" },
  { id: "purificador_agua", label: "Purificador / Filtro de Água", iconName: "Droplet", category: "cozinha", categoryLabel: "Cozinha & Eletros", colorClass: "text-sky-400" },
  { id: "cozinha_completa", label: "Cozinha Completa (Panelas e Louças)", iconName: "UtensilsCrossed", category: "cozinha", categoryLabel: "Cozinha & Eletros", colorClass: "text-emerald-600", isStandardDefault: true },
  { id: "maquina_lavar", label: "Máquina de Lavar Roupa", iconName: "WashingMachine", category: "cozinha", categoryLabel: "Cozinha & Eletros" },
  { id: "secadora", label: "Secadora de Roupa", iconName: "Wind", category: "cozinha", categoryLabel: "Cozinha & Eletros" },
  { id: "ferro_passar", label: "Ferro de Passar", iconName: "Shirt", category: "cozinha", categoryLabel: "Cozinha & Eletros" },

  // ── 4. Conectividade, Trabalho & Tecnologia ─────────────────────────────────
  { id: "wifi_alta_velocidade", label: "Wi-Fi Alta Velocidade", iconName: "Wifi", category: "tecnologia", categoryLabel: "Tecnologia & Trabalho", colorClass: "text-emerald-500", isStandardDefault: true },
  { id: "home_office", label: "Home Office / Bancada de Trabalho", iconName: "Briefcase", category: "tecnologia", categoryLabel: "Tecnologia & Trabalho", isStandardDefault: true },
  { id: "cadeira_ergonomica", label: "Cadeira Ergonômica", iconName: "Armchair", category: "tecnologia", categoryLabel: "Tecnologia & Trabalho" },
  { id: "smart_tv", label: "Smart TV", iconName: "Tv", category: "tecnologia", categoryLabel: "Tecnologia & Trabalho", colorClass: "text-indigo-500", isStandardDefault: true },
  { id: "canais_streaming", label: "Canais a Cabo / Streaming", iconName: "Cast", category: "tecnologia", categoryLabel: "Tecnologia & Trabalho" },
  { id: "fechadura_digital", label: "Fechadura Digital", iconName: "KeyRound", category: "tecnologia", categoryLabel: "Tecnologia & Trabalho", colorClass: "text-amber-500", isStandardDefault: true },
  { id: "cofre", label: "Cofre", iconName: "ShieldCheck", category: "tecnologia", categoryLabel: "Tecnologia & Trabalho" },
  { id: "voltagem_110v", label: "Voltagem 110V", iconName: "Zap", category: "tecnologia", categoryLabel: "Tecnologia & Trabalho" },
  { id: "voltagem_220v", label: "Voltagem 220V", iconName: "Zap", category: "tecnologia", categoryLabel: "Tecnologia & Trabalho" },
  { id: "chave_tradicional", label: "Chave Tradicional", iconName: "Key", category: "tecnologia", categoryLabel: "Tecnologia & Trabalho" },

  // ── 5. Garagem, Acesso & Infraestrutura do Prédio ───────────────────────────
  { id: "garagem_coberta", label: "Vaga de Garagem Coberta", iconName: "Car", category: "predio", categoryLabel: "Garagem & Prédio", colorClass: "text-blue-500", isStandardDefault: true },
  { id: "garagem_descoberta", label: "Vaga de Garagem Descoberta", iconName: "ParkingCircle", category: "predio", categoryLabel: "Garagem & Prédio" },
  { id: "sem_garagem", label: "Sem Garagem", iconName: "Slash", category: "predio", categoryLabel: "Garagem & Prédio" },
  { id: "acessibilidade_pne", label: "Acessibilidade / PNE", iconName: "Accessibility", category: "predio", categoryLabel: "Garagem & Prédio", colorClass: "text-sky-600" },
  { id: "elevador", label: "Elevador", iconName: "ArrowUpDown", category: "predio", categoryLabel: "Garagem & Prédio", isStandardDefault: true },
  { id: "acesso_escada", label: "Acesso por Escada", iconName: "Footprints", category: "predio", categoryLabel: "Garagem & Prédio" },
  { id: "portaria_24h", label: "Portaria 24h", iconName: "Shield", category: "predio", categoryLabel: "Garagem & Prédio", colorClass: "text-emerald-500", isStandardDefault: true },
  { id: "self_checkin", label: "Self Check-in / Cofre de Chaves", iconName: "Lock", category: "predio", categoryLabel: "Garagem & Prédio" },
  { id: "piscina", label: "Piscina", iconName: "Waves", category: "predio", categoryLabel: "Garagem & Prédio", colorClass: "text-cyan-500", isStandardDefault: true },
  { id: "academia", label: "Academia", iconName: "Dumbbell", category: "predio", categoryLabel: "Garagem & Prédio", colorClass: "text-rose-500", isStandardDefault: true },
  { id: "coworking", label: "Coworking", iconName: "Laptop", category: "predio", categoryLabel: "Garagem & Prédio" },
  { id: "lavanderia_coletiva", label: "Lavanderia Coletiva", iconName: "WashingMachine", category: "predio", categoryLabel: "Garagem & Prédio" },

  // ── 6. Políticas, Regras & Perfil de Hospedagem ─────────────────────────────
  { id: "aceita_pet", label: "Aceita Pet", iconName: "PawPrint", category: "regras", categoryLabel: "Políticas & Regras", colorClass: "text-amber-600", isStandardDefault: true },
  { id: "nao_aceita_pet", label: "Não Aceita Pet", iconName: "Ban", category: "regras", categoryLabel: "Políticas & Regras" },
  { id: "proibido_fumar", label: "Proibido Fumar", iconName: "CigaretteOff", category: "regras", categoryLabel: "Políticas & Regras", colorClass: "text-rose-500", isStandardDefault: true },
  { id: "permite_fumar_varanda", label: "Permite Fumar na Varanda", iconName: "Cigarette", category: "regras", categoryLabel: "Políticas & Regras" },
  { id: "adequado_criancas", label: "Adequado para Crianças", iconName: "Smile", category: "regras", categoryLabel: "Políticas & Regras", colorClass: "text-emerald-500" },
  { id: "foco_corporativo", label: "Foco Corporativo / Trabalho", iconName: "Building2", category: "regras", categoryLabel: "Políticas & Regras", colorClass: "text-indigo-500", isStandardDefault: true },
  { id: "foco_lazer", label: "Foco Lazer / Férias", iconName: "Compass", category: "regras", categoryLabel: "Políticas & Regras", colorClass: "text-sky-500" },
  { id: "longa_estadia", label: "Estadia Longa Permitida", iconName: "CalendarCheck", category: "regras", categoryLabel: "Políticas & Regras", colorClass: "text-purple-500", isStandardDefault: true },

  // ── 7. Status Operacional, Manutenção & Governança ──────────────────────────
  { id: "reformado", label: "Reformado / Modernizado", iconName: "Sparkles", category: "status", categoryLabel: "Status & Manutenção", colorClass: "text-amber-500", isStandardDefault: true },
  { id: "padrao_luxo", label: "Padrão Luxo / Premium", iconName: "Gem", category: "status", categoryLabel: "Status & Manutenção", colorClass: "text-purple-500" },
  { id: "padrao_basico", label: "Padrão Básico / Econômico", iconName: "Tag", category: "status", categoryLabel: "Status & Manutenção" },
  { id: "manutencao_pendente", label: "Manutenção Pendente", iconName: "Wrench", category: "status", categoryLabel: "Status & Manutenção", colorClass: "text-rose-500" },
  { id: "reparo_eletrico", label: "Reparo Elétrico Necessário", iconName: "Plug2", category: "status", categoryLabel: "Status & Manutenção", colorClass: "text-amber-600" },
  { id: "reparo_hidraulico", label: "Reparo Hidráulico Necessário", iconName: "Wrench", category: "status", categoryLabel: "Status & Manutenção", colorClass: "text-blue-500" },
  { id: "pintura_pendente", label: "Pintura Pendente", iconName: "PaintRoller", category: "status", categoryLabel: "Status & Manutenção", colorClass: "text-orange-500" },
  { id: "troca_enxoval", label: "Troca de Enxoval Pendente", iconName: "BedSingle", category: "status", categoryLabel: "Status & Manutenção" },
  { id: "vistoria_pendente", label: "Vistoria Pendente", iconName: "ClipboardCheck", category: "status", categoryLabel: "Status & Manutenção" },
  { id: "limpeza_pendente", label: "Limpeza Pendente", iconName: "SprayCan", category: "status", categoryLabel: "Status & Manutenção", colorClass: "text-amber-500" },
  { id: "limpeza_concluida", label: "Limpeza Concluída", iconName: "CheckCircle2", category: "status", categoryLabel: "Status & Manutenção", colorClass: "text-emerald-500" },
  { id: "bloqueado_reforma", label: "Bloqueado para Reforma", iconName: "Hammer", category: "status", categoryLabel: "Status & Manutenção", colorClass: "text-rose-600" },
  { id: "uso_proprietario", label: "Uso do Proprietário", iconName: "UserCheck", category: "status", categoryLabel: "Status & Manutenção", colorClass: "text-slate-700" },
  { id: "inativo_desativado", label: "Inativo / Desativado", iconName: "PowerOff", category: "status", categoryLabel: "Status & Manutenção", colorClass: "text-slate-400" },
];

export const LUCIDE_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Bed, BedDouble, Sofa, Crown, Layers, Baby, PlusCircle, DoorClosed, Bath, LayoutGrid, User, Users,
  Wind, AirVent, Fan, Flame, Sun, Sunset, Building, Home, VolumeX, Eye, Mountain, Trees, Moon,
  Microwave, Box, Refrigerator, CookingPot, Coffee, Utensils, Zap, Droplet, UtensilsCrossed, WashingMachine, Shirt,
  Wifi, Briefcase, Armchair, Tv, Cast, KeyRound, Key, ShieldCheck,
  Car, ParkingCircle, Slash, Accessibility, ArrowUpDown, Footprints, Shield, Lock, Waves, Dumbbell, Laptop,
  PawPrint, Ban, CigaretteOff, Cigarette, Smile, Building2, Compass, CalendarCheck,
  Sparkles, Gem, Tag, Wrench, Plug2, PaintRoller, BedSingle, ClipboardCheck, SprayCan, CheckCircle2, Hammer, UserCheck, PowerOff
};

export function renderAmenityIcon(iconName: string, className: string = "w-3.5 h-3.5") {
  const IconComponent = LUCIDE_ICON_MAP[iconName] || Tag;
  return <IconComponent className={className} />;
}

export function resolveAmenityTag(tagStr: string): FlatAmenityDefinition {
  const clean = tagStr.trim().toLowerCase();
  
  const directMatch = FLAT_AMENITIES_CATALOG.find(a => 
    a.id.toLowerCase() === clean || 
    a.label.toLowerCase() === clean
  );
  if (directMatch) return directMatch;

  if (clean.includes("split")) return FLAT_AMENITIES_CATALOG.find(a => a.id === "ar_split")!;
  if (clean.includes("janela")) return FLAT_AMENITIES_CATALOG.find(a => a.id === "ar_janela")!;
  if (clean.includes("solteiro")) return FLAT_AMENITIES_CATALOG.find(a => a.id === "2_camas_solteiro")!;
  if (clean.includes("casal")) return FLAT_AMENITIES_CATALOG.find(a => a.id === "cama_casal")!;
  if (clean.includes("micro")) return FLAT_AMENITIES_CATALOG.find(a => a.id === "microondas")!;
  if (clean.includes("reform")) return FLAT_AMENITIES_CATALOG.find(a => a.id === "reformado")!;
  if (clean.includes("alto")) return FLAT_AMENITIES_CATALOG.find(a => a.id === "andar_alto")!;
  if (clean.includes("baixo")) return FLAT_AMENITIES_CATALOG.find(a => a.id === "andar_baixo")!;
  if (clean.includes("vista")) return FLAT_AMENITIES_CATALOG.find(a => a.id === "vista_livre")!;
  if (clean.includes("tv")) return FLAT_AMENITIES_CATALOG.find(a => a.id === "smart_tv")!;
  if (clean.includes("frigobar")) return FLAT_AMENITIES_CATALOG.find(a => a.id === "frigobar")!;
  if (clean.includes("cozinha")) return FLAT_AMENITIES_CATALOG.find(a => a.id === "cozinha_completa")!;
  if (clean.includes("varanda")) return FLAT_AMENITIES_CATALOG.find(a => a.id === "varanda_sacada")!;
  if (clean.includes("pet")) return FLAT_AMENITIES_CATALOG.find(a => a.id === "aceita_pet")!;
  if (clean.includes("garagem")) return FLAT_AMENITIES_CATALOG.find(a => a.id === "garagem_coberta")!;
  if (clean.includes("fumar")) return FLAT_AMENITIES_CATALOG.find(a => a.id === "proibido_fumar")!;
  if (clean.includes("wifi")) return FLAT_AMENITIES_CATALOG.find(a => a.id === "wifi_alta_velocidade")!;

  return {
    id: `custom_${clean.replace(/\s+/g, '_')}`,
    label: tagStr,
    iconName: "Tag",
    category: "status",
    categoryLabel: "Personalizada"
  };
}

export function getFlatActiveAmenities(flat: any): FlatAmenityDefinition[] {
  const result: FlatAmenityDefinition[] = [];
  const tags: string[] = Array.isArray(flat.tags) ? flat.tags : [];

  if (flat.airConditionerType === "janela" || tags.some(t => t.toLowerCase().includes("janela"))) {
    result.push(FLAT_AMENITIES_CATALOG.find(a => a.id === "ar_janela")!);
  } else if (flat.airConditionerType === "split" || tags.some(t => t.toLowerCase().includes("split")) || !flat.airConditionerType) {
    result.push(FLAT_AMENITIES_CATALOG.find(a => a.id === "ar_split")!);
  }

  if (flat.bedType === "solteiro_duplo" || tags.some(t => t.toLowerCase().includes("solteiro"))) {
    result.push(FLAT_AMENITIES_CATALOG.find(a => a.id === "2_camas_solteiro")!);
  } else {
    result.push(FLAT_AMENITIES_CATALOG.find(a => a.id === "cama_casal")!);
  }

  if (flat.hasMicrowave || tags.some(t => t.toLowerCase().includes("micro"))) {
    const micro = FLAT_AMENITIES_CATALOG.find(a => a.id === "microondas");
    if (micro && !result.some(r => r.id === micro.id)) result.push(micro);
  }

  for (const t of tags) {
    const resolved = resolveAmenityTag(t);
    if (resolved && !result.some(r => r.id === resolved.id || r.label.toLowerCase() === resolved.label.toLowerCase())) {
      result.push(resolved);
    }
  }

  return result.filter(Boolean);
}
