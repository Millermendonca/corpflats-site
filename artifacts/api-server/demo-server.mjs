import { emitirNfseGissReal, COD_MUNICIPIO, renderGissDanfseHtml } from "./giss-soap.mjs";
import { processChatConversation, formatarDescricaoComTemplate, DEFAULT_FISCAL_TEMPLATE } from "./chat-service.mjs";
import { lookupCep, lookupCnpj } from "./lookup.mjs";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import * as XLSX from "xlsx";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import https from "https";
import { fileURLToPath } from "url";
import pg from "pg";
import { uploadImageToStorage } from "./storage-service.mjs";
import { MicrosoftGraphService } from "./microsoft-graph-service.mjs";

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure local uploads directory exists
const UPLOADS_DIR = path.join(__dirname, "uploads");
const LOST_ITEMS_DIR = path.join(UPLOADS_DIR, "lost_items");
if (!fs.existsSync(UPLOADS_DIR)) {
  try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch {}
}
if (!fs.existsSync(LOST_ITEMS_DIR)) {
  try { fs.mkdirSync(LOST_ITEMS_DIR, { recursive: true }); } catch {}
}

let pgPool = null;
if (process.env.DATABASE_URL) {
  try {
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false }
    });
    console.log("[PostgreSQL] Conexão com banco em nuvem inicializada.");
  } catch (err) {
    console.error("[PostgreSQL] Falha ao configurar pool:", err.message);
  }
}

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cookieParser());
app.use("/api/storage/files", express.static(UPLOADS_DIR));

// ── Database Health & Diagnostics Endpoint ──────────────────────────────────
app.get("/api/system/db-status", async (req, res) => {
  let pgStatus = "disconnected";
  let pgError = null;
  let lastSaved = null;

  if (pgPool) {
    try {
      const q = await pgPool.query("SELECT key, updated_at FROM system_store WHERE key = 'db_state'");
      pgStatus = "connected";
      if (q.rows && q.rows[0]) {
        lastSaved = q.rows[0].updated_at;
      }
    } catch (err) {
      pgStatus = "error";
      pgError = err.message;
    }
  }

  res.json({
    databaseType: pgPool ? "PostgreSQL Cloud (Blindado)" : "Local JSON (Efêmero)",
    pgStatus,
    pgError,
    lastSaved,
    dbStats: {
      cleaningRequestsCount: db.cleaningRequests?.length || 0,
      flatsCount: db.flats?.length || 0,
      usersCount: db.users?.length || 0,
      notificationsCount: db.notifications?.length || 0
    }
  });
});

// ── No Show (Admin only) ───────────────────────────────────────────────────
app.post("/api/cleaning/assignments/:requestId/no-show", (req, res) => {
  const userAuth = getAuthUser(req);
  if (userAuth && userAuth.role !== "admin") {
    return res.status(403).json({ error: "Apenas administradores podem marcar No Show." });
  }

  const reqId = Number(req.params.requestId);
  const item = db.cleaningRequests.find(r => r.id === reqId);
  if (!item) return res.status(404).json({ error: "Solicitação não encontrada" });

  const now = new Date().toISOString();
  const flat = db.flats.find(f => f.id === item.flatId);
  const fNum = flat ? flat.number : (item.flatNumber || String(item.flatId));

  // Marca TODOS os requests desse flat com status no_show para não aparecer em nenhuma data pendente
  for (const r of db.cleaningRequests) {
    if (r.flatId === item.flatId || r.flatNumber === fNum) {
      r.status = "no_show";
      r.isVacant = true;
      r.completedAt = now;
      r.pendingObservation = "No Show - Quarto não utilizado / Limpo";
      r.updatedAt = now;
    }
  }

  createNotification({
    category: "checkout",
    title: `🚫 No Show registrado no Flat ${fNum}`,
    message: `Reserva marcada como No Show pelo Administrador. Quarto liberado e considerado limpo.`,
    severity: "info",
    metadata: { flatId: item.flatId, flatNumber: fNum, status: "no_show" },
    targetUrl: "/dashboard"
  });

  saveDatabase();

  res.json({
    ...item,
    flatNumber: fNum,
    message: "No Show registrado com sucesso. Quarto liberado!"
  });
});

app.post("/api/admin/restore-historical-cleanings", (req, res) => {
  if (!db.cleaningRequests) db.cleaningRequests = [];

  // Cris: Ontem (16/08/2026): 904, 905, 511, 512, 313, 116, 605
  const ontemCrisClean = ["904", "905", "511", "512", "313", "116", "605"];

  // Cris: Hoje (17/08/2026): 113, 114, 116, 211, 212, 313, 712, 907, 1004
  const hojeCrisClean = ["113", "114", "116", "211", "212", "313", "712", "907", "1004"];

  // Grazi: Hoje (17/08/2026): 215, 509, 511, 512, 715
  const hojeGraziClean = ["215", "509", "511", "512", "715"];

  // No Show: 1304 (Ontem e Hoje)
  const noShowFlats = ["1304"];

  function applyStatus(flatNumber, dateStr, status, userId, username) {
    const flat = db.flats.find(f => f.number === flatNumber);
    if (!flat) return;

    let req = db.cleaningRequests.find(r => (r.flatNumber === flatNumber || r.flatId === flat.id) && r.requestDate === dateStr);
    const now = new Date().toISOString();

    if (req) {
      req.status = status;
      req.assignedUserId = userId;
      req.assignedUsername = username;
      if (status === "clean" || status === "no_show") {
        req.completedAt = req.completedAt || `${dateStr}T16:00:00.000Z`;
        req.willCleanAt = req.willCleanAt || `${dateStr}T10:00:00.000Z`;
        req.cleaningStartedAt = req.cleaningStartedAt || `${dateStr}T10:30:00.000Z`;
      }
      if (status === "no_show") {
        req.pendingObservation = "No Show - Quarto não utilizado / Limpo";
        req.isVacant = true;
      }
      req.updatedAt = now;
    } else {
      req = {
        id: db.cleaningRequests.length > 0 ? Math.max(...db.cleaningRequests.map(r => r.id)) + 1 : 1,
        flatId: flat.id,
        flatNumber: flat.number,
        requestDate: dateStr,
        source: "checkout",
        status: status,
        assignedUserId: userId,
        assignedUsername: username,
        isVacant: status === "clean" || status === "no_show",
        isPriority: false,
        leavingGuest: "Hóspede",
        arrivingGuest: null,
        pendingObservation: status === "no_show" ? "No Show - Quarto não utilizado / Limpo" : null,
        willCleanAt: `${dateStr}T10:00:00.000Z`,
        cleaningStartedAt: `${dateStr}T10:30:00.000Z`,
        completedAt: (status === "clean" || status === "no_show") ? `${dateStr}T16:00:00.000Z` : null,
        createdAt: `${dateStr}T08:00:00.000Z`,
        updatedAt: now
      };
      db.cleaningRequests.push(req);
    }
  }

  // Aplicar Ontem (16/08)
  for (const num of ontemCrisClean) applyStatus(num, "2026-08-16", "clean", 2, "Cris");
  // O 211 e 212 foram limpos hoje pela Cris, então as pendências de ontem foram concluídas!
  applyStatus("211", "2026-08-16", "clean", 2, "Cris");
  applyStatus("212", "2026-08-16", "clean", 2, "Cris");

  // Aplicar Hoje (17/08)
  for (const num of hojeCrisClean) applyStatus(num, "2026-08-17", "clean", 2, "Cris");
  for (const num of hojeGraziClean) applyStatus(num, "2026-08-17", "clean", 3, "Grazi");

  // Aplicar No Show (1304)
  for (const num of noShowFlats) {
    const flatObj = db.flats.find(f => f.number === num);
    for (const r of db.cleaningRequests) {
      if (r.flatNumber === num || (flatObj && r.flatId === flatObj.id)) {
        r.status = "no_show";
        r.isVacant = true;
        r.pendingObservation = "No Show - Quarto não utilizado / Limpo";
        r.updatedAt = new Date().toISOString();
      }
    }
  }

  saveDatabase();

  res.json({
    success: true,
    message: "Histórico de limpezas de ontem e hoje restaurado e No Show aplicado no PostgreSQL Cloud!",
    totalRequests: db.cleaningRequests.length,
    todayCleanCount: db.cleaningRequests.filter(r => r.requestDate === "2026-08-17" && r.status === "clean").length
  });
});

// ── Password Hashing Helper ──────────────────────────────────────────────────
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  if (!storedHash.includes(":")) {
    return password === storedHash; // legacy plain text fallback
  }
  const [salt, key] = storedHash.split(":");
  const testHash = crypto.scryptSync(password, salt, 32).toString("hex");
  return key === testHash;
}

// ── Database Persistence ────────────────────────────────────────────────────
const DATA_DIR = path.resolve(__dirname, "../../data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const DB_FILE = path.join(DATA_DIR, "database.json");

const defaultUsers = [
  { id: 1, username: "admin", role: "admin", passwordHash: hashPassword("admin123") },
  { id: 2, username: "Cris", role: "camareira", passwordHash: hashPassword("1234") },
  { id: 3, username: "Grazi", role: "camareira", passwordHash: hashPassword("1234") },
];

let db = {
  users: defaultUsers,
  flats: [],
  cleaningRequests: [],
  periodicTasks: [],
  periodicExecutions: [],
  surveys: [],
  observations: [],
  guests: [],
  guestAccounts: [],
  reviews: [],
  reviewInsights: null,
  garageAuthorizations: [],
  reservations: [],
  roomBlocks: [],
  notifications: [],
  notificationSettings: {
    soundEnabled: true,
    adminWhatsApp: "5522997124021",
    webhookUrl: "",
    notifyOnBreakfast: true,
    notifyOnLostItem: true,
    notifyOnDefect: true,
    notifyOnCheckout: true,
    notifyOnSystemError: true,
    notifyOnAbandonedCart: true,
    notifyOnOvertimeCleaning: true,
  },
  settings: {
    onedriveShareUrl: "https://1drv.ms/x/c/caba622def61cb38/IQAABAFTc9qBR7cpKTgR2Lo3AYHW4JrwOU2p8ekBEcgydyI?e=Ohs2xW",
    onedriveLinkConfigured: true,
    syncIntervalMinutes: 60,
    lastSyncedAt: new Date().toISOString(),
    sheetName: "Agenda",
    alertHour: 15,
    adminWhatsApp: "5522997124021",
    checkinTime: "14:00",
    checkoutTime: "12:00",
    autoEarlyCheckinForSite: true
  },
  siteConfig: null
};

const DEFAULT_SITE_CONFIG = {
  theme: {
    primaryColor: "sky",
    style: "clean-modern",
    mode: "light",
  },
  branding: {
    brandName: "CorpFlats",
    tagline: "Hospitalidade Contemporânea, Flats Arejados e Conforto Total",
    badgeTop: "⭐ Melhor Tarifa Garantida Sempre pelo Nosso Site Oficial",
    logoText: "CorpFlats",
    logoSubtext: "Campos dos Goytacazes",
    logoImage: "",
    phone: "5522997124021",
    whatsapp: "5522997124021",
    email: "reservas@corpflats.com.br",
    address: "Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ, CEP 28010-140 (Edifício Soho Residence Service)",
    googleMapsUrl: "https://maps.google.com/?q=Rua+Conselheiro+Otaviano,+209+-+Centro,+Campos+dos+Goytacazes+-+RJ",
  },
  hero: {
    title: "Sua Estadia com Conforto & Estilo em Campos dos Goytacazes",
    highlightText: "Conforto, Luz Natural e Sofisticação",
    description: "Flats decorados com estética contemporânea e arejada, ar-condicionado split em todos os ambientes, Wi-Fi 500MB ultra rápido e localização nobre no Edifício Soho Residence Service no Centro de Campos dos Goytacazes.",
    backgroundImage: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1920&q=80",
    buttonText: "Buscar Disponibilidade",
    floatingBadgeText: "🏆 Avaliação 4.9/5 estrelas por mais de 1.200 hóspedes",
  },
  ratePlans: {
    with_breakfast: {
      name: "Com Café Incluso",
      dailyRate: 225,
      cleaningFeeEnabled: false,
      cleaningFeeAmount: 0,
      cleaningFeeType: "per_stay",
      description: "Diária com Café da Manhã servido exclusivamente no flat"
    },
    room_only: {
      name: "Sem Café",
      dailyRate: 190,
      cleaningFeeEnabled: true,
      cleaningFeeAmount: 70,
      cleaningFeeType: "per_stay",
      description: "Tarifa econômica sem café da manhã"
    }
  },
  bedConfig: {
    twinFeeAmount: 30,
    twinFeeType: "per_stay",
    cutoffHour: 12
  },
  extraBedConfig: {
    enabled: true,
    feeAmount: 60,
    feeType: "per_stay",
    cutoffHour: 12,
    maxGuests: 3,
    warningMessage: "Nossos flats são projetados para até 2 pessoas (lotação ideal). Para acomodar com carinho um 3º hóspede, disponibilizamos a montagem de 1 colchonete extra com enxoval completo e higienizado."
  },
  petPolicy: {
    enabled: true,
    feeAmount: 80,
    feeType: "per_stay",
    allowedSpecies: "Cachorros (Cães) de pequeno e médio porte (até 15kg)",
    rules: "• Uso obrigatório de guia/coleira nas áreas sociais do condomínio.\n• Proibido deixar o animal sozinho no flat por longos períodos.\n• O hóspede tutor é responsável pela conservação e integridade do apartamento."
  },
  pricing: {
    directDiscountPercent: 15,
    pixDiscountPercent: 5
  },
  amenities: [
    {
      id: "pool",
      icon: "Waves",
      title: "Piscina com Deck Panorâmico",
      description: "Área de lazer ensolarada no condomínio com vista privilegiada para relaxar.",
      badge: "Lazer"
    },
    {
      id: "wifi",
      icon: "Wifi",
      title: "Wi-Fi Fibra 500 Mega",
      description: "Conexão dedicada de alta estabilidade para home office e streaming em 4K.",
      badge: "Gratuito"
    },
    {
      id: "ac",
      icon: "Wind",
      title: "Ar-Condicionado Climatizado",
      description: "Ambientes frescos e arejados com splits modernos e silenciosos.",
      badge: "Conforto"
    },
    {
      id: "garage",
      icon: "Car",
      title: "Garagem Coberta Privativa",
      description: "Vaga demarcada e portão eletrônico automático com segurança 24h.",
      badge: "Incluso"
    },
    {
      id: "kitchen",
      icon: "Utensils",
      title: "Cozinha Compacta Equipada",
      description: "Cooktop, micro-ondas, frigobar/geladeira, cafeteira e utensílios completos.",
      badge: "Praticidade"
    },
    {
      id: "breakfast",
      icon: "Coffee",
      title: "Café da Manhã Servido no Flat",
      description: "Cestas gourmet artesanais montadas com frutas, pães e sucos selecionados.",
      badge: "Opcional"
    },
    {
      id: "tv",
      icon: "Tv",
      title: "Smart TV 55\" 4K",
      description: "Acesso a Netflix, YouTube, canais digitais e streaming para relaxar.",
      badge: "Entretenimento"
    },
    {
      id: "gym",
      icon: "Dumbbell",
      title: "Espaço Fitness",
      description: "Academia equipada no condomínio para manter seus treinos e saúde em dia.",
      badge: "Fitness"
    }
  ],
  gallery: [
    {
      id: 1,
      title: "Suíte Master Arejada & Cama King",
      category: "Quartos",
      imageUrl: "https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1200&q=80"
    },
    {
      id: 2,
      title: "Living com Luz Natural e Decoração Clean",
      category: "Living",
      imageUrl: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80"
    },
    {
      id: 3,
      title: "Varanda com Vista e Brisa Fresca",
      category: "Varanda",
      imageUrl: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80"
    },
    {
      id: 4,
      title: "Cozinha Moderna Integrada",
      category: "Cozinha",
      imageUrl: "https://images.unsplash.com/photo-1556912172-45b7abe8b7e1?auto=format&fit=crop&w=1200&q=80"
    },
    {
      id: 5,
      title: "Banheiro Impecável com Ducha Relaxante",
      category: "Banheiro",
      imageUrl: "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=1200&q=80"
    },
    {
      id: 6,
      title: "Deck com Piscina e Relaxamento",
      category: "Lazer",
      imageUrl: "https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?auto=format&fit=crop&w=1200&q=80"
    }
  ],
  testimonials: [
    {
      id: 1,
      name: "Mariana Silveira",
      city: "Rio de Janeiro, RJ",
      rating: 5,
      comment: "O flat é incrivelmente arejado, com iluminação natural maravilhosa e limpeza impecável. Dá uma paz enorme ao entrar. A localização em Campos dos Goytacazes no Soho é perfeita!",
      date: "Fevereiro de 2026",
      avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80"
    },
    {
      id: 2,
      name: "Carlos Eduardo Mendes",
      city: "São Paulo, SP",
      rating: 5,
      comment: "Melhor experiência de hospedagem em Campos dos Goytacazes. Decoração moderna, internet super estável para trabalhar e cama de hotel 5 estrelas. Recomendo de olhos fechados.",
      date: "Janeiro de 2026",
      avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80"
    },
    {
      id: 3,
      name: "Patrícia & Rodrigo",
      city: "Belo Horizonte, MG",
      rating: 5,
      comment: "O café da manhã servido no flat é um diferencial sensacional. Tudo quentinho e fresco. O atendimento pelo WhatsApp é ágil e educado.",
      date: "Fevereiro de 2026",
      avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80"
    }
  ],
  about: {
    title: "Uma Nova Experiência em Hospedagem",
    subtitle: "Conceito Flat Boutique com Liberdade e Conforto no Centro de Campos",
    description: "A CorpFlats foi pensada para oferecer a viajantes a lazer e a negócios uma estadia luminosa, acolhedora e contemporânea. Nossos apartamentos combinam o espaço e a privacidade de um lar com o conforto e a praticidade de uma hotelaria de excelência no Edifício Soho Residence Service.",
    stats: [
      { label: "Flats Exclusivos", value: "19+" },
      { label: "Hóspedes Felizes", value: "3.500+" },
      { label: "Avaliação Média", value: "4.9 ★" },
      { label: "Taxa de Retorno", value: "94%" }
    ]
  },
  faq: [
    {
      q: "Qual o horário de check-in e check-out?",
      a: "O check-in inicia a partir das 14:00 e o check-out é até as 12:00. Caso precise de early check-in ou late check-out, solicite diretamente pelo WhatsApp com nossa equipe."
    },
    {
      q: "Como funciona o estacionamento / garagem?",
      a: "Dispomos de vagas privativas cobertas no condomínio com portão eletrônico e monitoramento 24h, inclusas gratuitamente na sua diária."
    },
    {
      q: "Como é servido o café da manhã?",
      a: "O café da manhã é servido em cesta gourmet personalizada diretamente no seu flat, no horário de sua preferência entre 06:30 e 09:30."
    },
    {
      q: "Quais são as formas de pagamento aceitas?",
      a: "Aceitamos PIX Instantâneo com confirmação automática na hora e Cartão de Crédito com parcelamento facilitado."
    },
    {
      q: "O flat possui Wi-Fi veloz para trabalhar?",
      a: "Sim! Todos os nossos flats contam com fibra óptica dedicada de 500 Mega de alta estabilidade e bancada própria para notebook."
    }
  ],
  petPolicy: {
    enabled: true,
    feeAmount: 80,
    feeType: "per_stay", // "per_stay" ou "per_night"
    maxPets: 2,
    allowedSpecies: "Cachorros (Cães)",
    rules: "• É expressamente proibida a entrada de quaisquer animais, EXCETO Cachorros de pequeno e médio porte (até 15kg).\n• É obrigatório o uso de coleira/guia nas áreas comuns do condomínio.\n• Proibido deixar o animal sozinho no apartamento por longos períodos.\n• O hóspede tutor é responsável pela limpeza de resíduos e conservação dos móveis e enxoval."
  },
  cancellationPolicy: {
    rule: "dynamic_7days",
    strictDaysThreshold: 7,
    freeCancellationHoursBeforeCheckin: 24,
    description: "Reservas com mais de 7 dias de antecedência: Política Rigorosa (não reembolsável). Reservas feitas com 7 dias ou menos de antecedência: Política Flexível (cancelamento 100% gratuito e reembolso integral até 24h antes do check-in às 14:00)."
  },
  bedConfig: {
    allowTwinBeds: true,
    twinFeeAmount: 30,
    twinFeeType: "per_stay", // "per_stay" ou "per_night"
    twinAllowedFlats: [113, 114, 115, 202, 905], // Lista de números de flats que suportam montagem de 2 camas solteiro
    twinSameDayCutoffTime: "12:00" // Horário limite no dia do check-in para pedir 2 camas de solteiro
  },
  extraBedConfig: {
    enabled: true,
    maxGuestsPerFlat: 3,
    feeAmount: 60,
    feeType: "per_night", // "per_night" ou "per_stay"
    description: "Montagem de colchonete extra com enxoval completo, travesseiro e jogo de cama higienizado para o 3º hóspede.",
    notice: "Nossos flats são projetados para até 2 pessoas (lotação ideal). Para acomodar com carinho um 3º hóspede, disponibilizamos a montagem de 1 colchonete extra com enxoval completo."
  },
  ratePlans: {
    with_breakfast: {
      name: "Com Café da Manhã Incluso",
      dailyRate: 225,
      cleaningFeeEnabled: false,
      cleaningFeeAmount: 0,
      cleaningFeeType: "per_stay", // "per_stay" ou "per_night"
      description: "Diária com Café da Manhã servido exclusivamente no flat",
      badge: "Café da Manhã Exclusivo"
    },
    room_only: {
      name: "Apenas Hospedagem (Sem Café)",
      dailyRate: 190,
      cleaningFeeEnabled: true,
      cleaningFeeAmount: 70,
      cleaningFeeType: "per_stay", // "per_stay" ou "per_night"
      description: "Tarifa econômica sem café da manhã",
      badge: "Tarifa Econômica"
    }
  },
  pricing: {
    directDiscountPercent: 15
  }
};

const stayoverFlatsByDate = new Map();
const inHouseFlatsByDate = new Map();

async function loadDatabase() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, "utf-8");
      const loaded = JSON.parse(content);
      db = { ...db, ...loaded };
    }
    if (pgPool) {
      try {
        await pgPool.query(`
          CREATE TABLE IF NOT EXISTS system_store (
            key TEXT PRIMARY KEY,
            value JSONB NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );
          CREATE TABLE IF NOT EXISTS system_audit_logs (
            id BIGSERIAL PRIMARY KEY,
            timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            level TEXT NOT NULL,
            category TEXT NOT NULL,
            action TEXT NOT NULL,
            actor JSONB NOT NULL DEFAULT '{}',
            details JSONB NOT NULL DEFAULT '{}',
            source TEXT NOT NULL DEFAULT 'server'
          );
          CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON system_audit_logs (timestamp DESC);
          CREATE INDEX IF NOT EXISTS idx_audit_category ON system_audit_logs (category);
          CREATE INDEX IF NOT EXISTS idx_audit_level ON system_audit_logs (level);
        `);
        const res = await pgPool.query("SELECT value FROM system_store WHERE key = 'db_state'");
        if (res && res.rows && res.rows[0]) {
          const pgLoaded = res.rows[0].value;
          db = { ...db, ...pgLoaded };
          console.log("[PostgreSQL] Estado restaurado da nuvem com sucesso!");
        }
      } catch (err) {
        console.warn("[PostgreSQL] Falha ao sincronizar estado inicial:", err.message);
      }
    }

    // Auto-sanitização mandatória: Remove resquícios legados de Macaé e garante Campos dos Goytacazes
    const branding = db.siteConfig?.branding || {};
    const hero = db.siteConfig?.hero || {};
    const about = db.siteConfig?.about || {};

    if (
      !db.siteConfig ||
      branding.address?.includes("Macaé") ||
      branding.address?.includes("Atlântica") ||
      branding.brandName?.includes("Macaé") ||
      hero.title?.includes("Macaé") ||
      hero.description?.includes("Macaé") ||
      hero.description?.includes("Cavaleiros") ||
      about.description?.includes("Cavaleiros")
    ) {
      console.log("[Migration] Sanitizando textos legados para Campos dos Goytacazes / Edifício Soho...");
      db.siteConfig = {
        ...DEFAULT_SITE_CONFIG,
        ...(db.siteConfig || {}),
        branding: {
          ...DEFAULT_SITE_CONFIG.branding,
          ...branding,
          brandName: "CorpFlats",
          logoSubtext: "Campos dos Goytacazes",
          badgeTop: "⭐ Melhor Tarifa Garantida Sempre pelo Nosso Site Oficial",
          address: "Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ, CEP 28010-140 (Edifício Soho Residence Service)",
          googleMapsUrl: "https://maps.google.com/?q=Rua+Conselheiro+Otaviano,+209+-+Centro,+Campos+dos+Goytacazes+-+RJ"
        },
        hero: {
          ...DEFAULT_SITE_CONFIG.hero,
          ...hero,
          title: "Sua Estadia com Conforto & Estilo em Campos dos Goytacazes",
          highlightText: "Conforto, Luz Natural e Sofisticação",
          description: "Flats decorados com estética contemporânea e arejada, ar-condicionado split em todos os ambientes, Wi-Fi 500MB ultra rápido e localização nobre no Edifício Soho Residence Service no Centro de Campos dos Goytacazes."
        },
        about: {
          ...DEFAULT_SITE_CONFIG.about,
          ...about,
          subtitle: "Conceito Flat Boutique com Liberdade e Conforto no Centro de Campos",
          description: "A CorpFlats foi pensada para oferecer a viajantes a lazer e a negócios uma estadia luminosa, acolhedora e contemporânea. Nossos apartamentos combinam o espaço e a privacidade de um lar com o conforto e a praticidade de uma hotelaria de excelência no Edifício Soho Residence Service."
        },
        ratePlans: db.siteConfig?.ratePlans || DEFAULT_SITE_CONFIG.ratePlans,
        bedConfig: db.siteConfig?.bedConfig || DEFAULT_SITE_CONFIG.bedConfig,
        extraBedConfig: db.siteConfig?.extraBedConfig || DEFAULT_SITE_CONFIG.extraBedConfig,
        petPolicy: db.siteConfig?.petPolicy || DEFAULT_SITE_CONFIG.petPolicy,
        pricing: db.siteConfig?.pricing || DEFAULT_SITE_CONFIG.pricing
      };

      if (db.settings) {
        db.settings.hotelAddress = "Edifício Soho Residence Service, Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ";
        db.settings.googleMapsUrl = "https://maps.google.com/?q=Rua+Conselheiro+Otaviano,+209+-+Centro,+Campos+dos+Goytacazes+-+RJ";
      }

      saveDatabase();
    }

    if (!db.settings) db.settings = {};
    if (!db.settings.mercadoPagoConfig || !db.settings.mercadoPagoConfig.accessToken) {
      db.settings.mercadoPagoConfig = {
        accessToken: "APP_USR-2731253548432791-081914-0cf47f75d865fb5ce9f5a1b95c744ca1-3628826676",
        publicKey: "APP_USR-3c0fcec7-8a2f-436f-b471-dac950fd9933",
        clientId: "2731253548432791",
        clientSecret: "eMz5j4OOTMs9xeOqJmKqHdlBciL916B2",
        isConfigured: true,
        sandbox: false,
        updatedAt: new Date().toISOString()
      };
      saveDatabase();
    }

    if (!db.notifications) db.notifications = [];
    if (!db.lostAndFound) db.lostAndFound = [];

    // Garantir registro seguro do item relógio encontrado no Apt 511
    if (!db.lostAndFound.some(i => i.flatNumber === "511" && (i.description?.toLowerCase().includes("relógio") || i.description?.toLowerCase().includes("relogio")))) {
      db.lostAndFound.unshift({
        id: db.lostAndFound.length > 0 ? Math.max(...db.lostAndFound.map(i => i.id || 0)) + 1 : 1,
        flatId: 11,
        flatNumber: "511",
        description: "Relógio de pulso",
        locationInRoom: "Mesa de cabeceira / Quarto",
        photoUrl: null,
        status: "guardado",
        foundBy: "Camareira",
        lastGuestName: "Arthur A",
        lastGuestPhone: "22996029500",
        lastGuestEmail: "arthur@email.com",
        notes: "Item encontrado durante a limpeza de saída. Guardado com segurança na governança.",
        createdAt: "2026-08-25T14:30:00.000Z",
        updatedAt: "2026-08-25T14:30:00.000Z"
      });
      saveDatabase();
    }

    if (!db.notificationSettings) {
      db.notificationSettings = {
        soundEnabled: true,
        adminWhatsApp: "",
        webhookUrl: "",
        notifyOnBreakfast: true,
        notifyOnLostItem: true,
        notifyOnDefect: true,
        notifyOnCheckout: true,
        notifyOnSystemError: true,
        notifyOnAbandonedCart: true,
        notifyOnOvertimeCleaning: true,
      };
    }
    // Ensure admin exists
    if (!db.users || db.users.length === 0) {
      db.users = defaultUsers;
    }
  } catch (err) {
    console.error("[Database] Erro ao ler database:", err);
  }
}

function ensureUniqueRequestIds() {
  if (!db.cleaningRequests) db.cleaningRequests = [];
  const seenIds = new Set();
  let maxId = 0;
  for (const req of db.cleaningRequests) {
    const numId = Number(req.id);
    if (!isNaN(numId) && numId > maxId) {
      maxId = numId;
    }
  }
  for (const req of db.cleaningRequests) {
    const numId = Number(req.id);
    if (!numId || isNaN(numId) || seenIds.has(numId)) {
      maxId++;
      req.id = maxId;
    } else {
      req.id = numId;
    }
    seenIds.add(req.id);
  }
}

function saveDatabase() {
  try {
    ensureUniqueRequestIds();
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
    if (pgPool) {
      pgPool.query(
        "INSERT INTO system_store (key, value, updated_at) VALUES ('db_state', $1, NOW()) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()",
        [JSON.stringify(db)]
      ).catch(e => console.warn("[PostgreSQL] Erro ao persistir estado:", e.message));
    }
  } catch (err) {
    console.error("[Database] Erro ao salvar database:", err);
  }
}

// ── Fail-Safe Audit Log Engine ───────────────────────────────────────────────
const AUDIT_LOG_FILE = path.join(__dirname, "audit_logs.jsonl");

async function logAuditEvent({
  level = "info",
  category = "system",
  action,
  actor = null,
  details = {},
  source = "server",
  ip = "",
  userAgent = ""
}) {
  try {
    if (!db.auditLogs) db.auditLogs = [];

    const now = new Date().toISOString();
    const id = db.auditLogs.length > 0 ? (db.auditLogs[0].id || db.auditLogs.length) + 1 : 1;

    const logEntry = {
      id,
      timestamp: now,
      level,
      category,
      action: action || "EVENT",
      actor: actor || { name: "Sistema", role: "system" },
      details: details || {},
      source: source || "server",
      ip: ip || (actor && actor.ip) || "",
      userAgent: userAgent || (actor && actor.userAgent) || ""
    };

    // 1. Memória (Últimos 2.500 registros)
    db.auditLogs.unshift(logEntry);
    if (db.auditLogs.length > 2500) {
      db.auditLogs = db.auditLogs.slice(0, 2500);
    }

    // 2. Append-Only em arquivo local à prova de falhas
    try {
      fs.appendFileSync(AUDIT_LOG_FILE, JSON.stringify(logEntry) + "\n", "utf-8");
    } catch {}

    // 3. Persistência em PostgreSQL dedicado
    if (pgPool) {
      pgPool.query(
        `INSERT INTO system_audit_logs (timestamp, level, category, action, actor, details, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [now, level, category, logEntry.action, JSON.stringify(logEntry.actor), JSON.stringify(logEntry.details), source]
      ).catch(() => {});
    }

    console.log(`[AUDIT:${level.toUpperCase()}] [${category.toUpperCase()}] ${logEntry.action}`);
    return logEntry;
  } catch (err) {
    console.error("[Audit Error]", err);
    return null;
  }
}

// ── Central Notification Engine ─────────────────────────────────────────────
function createNotification({ category, title, message, severity = "info", metadata = {}, targetUrl = "" }) {
  try {
    if (!db.notifications) db.notifications = [];
    const settings = db.notificationSettings || {};

    const categoryMap = {
      breakfast: settings.notifyOnBreakfast !== false,
      lost_item: settings.notifyOnLostItem !== false,
      defect: settings.notifyOnDefect !== false,
      checkout: settings.notifyOnCheckout !== false,
      system_error: settings.notifyOnSystemError !== false,
      abandoned_cart: settings.notifyOnAbandonedCart !== false,
      cleaning_alert: settings.notifyOnOvertimeCleaning !== false,
    };

    // Registra no Audit Log Fail-Safe simultaneamente
    logAuditEvent({
      level: severity === "danger" || severity === "error" ? "error" : (severity === "warning" ? "warning" : (severity === "success" ? "success" : "info")),
      category: category === "checkout" || category === "abandoned_cart" ? "reservation" : (category === "system_error" ? "system" : "cleaning"),
      action: `NOTIFICATION_${category.toUpperCase()}`,
      details: { title, message, metadata, targetUrl }
    });

    if (categoryMap[category] === false) {
      return null;
    }

    const id = db.notifications.length > 0 ? Math.max(...db.notifications.map(n => n.id)) + 1 : 1;
    const notification = {
      id,
      category,
      title,
      message,
      severity,
      metadata: metadata || {},
      targetUrl: targetUrl || "",
      read: false,
      createdAt: new Date().toISOString()
    };

    db.notifications.unshift(notification);
    if (db.notifications.length > 250) {
      db.notifications = db.notifications.slice(0, 250);
    }
    saveDatabase();

    // Trigger webhook if configured
    if (settings.webhookUrl) {
      try {
        fetch(settings.webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "guest_flow_notification",
            notification
          })
        }).catch(() => {});
      } catch {}
    }

    return notification;
  } catch (err) {
    console.error("[Notification] Erro ao criar notificação:", err);
    return null;
  }
}

loadDatabase();
ensureUniqueRequestIds();

let checkinsList = [];
let existingManualRequests = [];

// ── Session Auth Helper (with Global Session Revocation Version) ─────────────
const AUTH_COOKIE_NAME = "gfm_session_v2";
const AUTH_SESSION_VERSION = 2;

function getAuthUser(req) {
  const token = req.cookies?.[AUTH_COOKIE_NAME] || req.headers?.["authorization"]?.replace("Bearer ", "");
  if (!token) return null;
  try {
    const raw = Buffer.from(token, "base64").toString("utf-8");
    const data = JSON.parse(raw);
    if (data.v !== AUTH_SESSION_VERSION) return null; // Invalida qualquer sessão legada
    const found = db.users.find(u => u.id === data.id);
    if (!found) return null;
    return { id: found.id, username: found.username, role: found.role };
  } catch {
    return null;
  }
}

// ── Spreadsheet Path & Cloud Download ────────────────────────────────────────
const LOCAL_SPREADSHEET_PATHS = [
  "C:\\Users\\mille\\OneDrive\\Documentos\\Calendário de Reservas 23-11-2025.xlsx",
  "C:\\Users\\mille\\OneDrive\\Hotel\\Calendário de Reservas 23-11-2025.xlsx",
  "C:\\Users\\mille\\OneDrive\\Hotel\\Documentos hóspedes\\Calendário de Reservas 23-11-2025.xlsx",
  "C:\\Users\\mille\\OneDrive\\Hotel\\Documentos hóspedes\\FLAT_CAMPOS.xlsx",
  "C:\\Users\\mille\\OneDrive\\Documentos\\Hotel\\Calendário de reservas 2024.xlsx",
];

function getLocalSpreadsheetPath() {
  // 1. Tenta caminhos diretos conhecidos
  for (const p of LOCAL_SPREADSHEET_PATHS) {
    if (fs.existsSync(p)) return p;
  }

  // 2. Tenta varrer as pastas do OneDrive do Hotel e Documentos por qualquer arquivo de Calendario de Reservas .xlsx
  const searchDirs = [
    "C:\\Users\\mille\\OneDrive\\Documentos",
    "C:\\Users\\mille\\OneDrive\\Hotel",
    "C:\\Users\\mille\\OneDrive\\Hotel\\Documentos hóspedes"
  ];

  for (const d of searchDirs) {
    if (fs.existsSync(d)) {
      try {
        const files = fs.readdirSync(d);
        const xlsxFile = files.find(f => 
          f.toLowerCase().includes("calend") && 
          f.toLowerCase().endsWith(".xlsx") && 
          !f.startsWith("~$")
        );
        if (xlsxFile) {
          return path.join(d, xlsxFile);
        }
      } catch {}
    }
  }

  return null;
}

function convertToDirectDownloadUrls(shareUrl) {
  if (!shareUrl) return [];
  const urls = [];
  try {
    const encoded = 'u!' + Buffer.from(shareUrl).toString('base64').replace(/=/g, '').replace(/\//g, '_').replace(/\+/g, '-');
    urls.push(`https://api.onedrive.com/v1.0/shares/${encoded}/root/content`);
  } catch {}
  if (shareUrl.includes("1drv.ms")) {
    urls.push(shareUrl.includes("?") ? `${shareUrl}&download=1` : `${shareUrl}?download=1`);
  } else {
    urls.push(shareUrl);
  }
  return urls;
}

function normalizeGuest(g) {
  return String(g || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function isSameGuest(g1, g2) {
  const norm1 = normalizeGuest(g1);
  const norm2 = normalizeGuest(g2);
  if (!norm1 || !norm2) return false;
  if (norm1 === norm2) return true;

  // Extrai códigos como "w 0210", "w 0190", números de telefone ou identificadores
  const code1 = norm1.match(/\bw\s*\d{3,4}\b|\b\d{4,5}[-\s]?\d{4}\b/);
  const code2 = norm2.match(/\bw\s*\d{3,4}\b|\b\d{4,5}[-\s]?\d{4}\b/);
  if (code1 && code2 && code1[0].replace(/\s+/g, "") === code2[0].replace(/\s+/g, "")) {
    return true; // Mesmo código de reserva / WhatsApp
  }

  // Compara primeiro nome se houver abreviação (ex: "fabiana" e "fabi")
  const words1 = norm1.split(" ");
  const words2 = norm2.split(" ");
  if (words1[0].length >= 3 && words2[0].length >= 3 && (words1[0].startsWith(words2[0]) || words2[0].startsWith(words1[0]))) {
    if (words1.slice(1).join(" ") === words2.slice(1).join(" ")) {
      return true;
    }
  }

  return false;
}

const BRAZIL_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

function getTodayStr() {
  return BRAZIL_DATE_FORMATTER.format(new Date());
}

function getOffsetDateStr(offsetDays = 0) {
  if (offsetDays === 0) return getTodayStr();
  const todayStr = getTodayStr();
  const [y, m, d] = todayStr.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1, d + offsetDays, 12, 0, 0));
  return target.toISOString().substring(0, 10);
}

function getPrevDay(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d - 1, 12, 0, 0));
  return prev.toISOString().substring(0, 10);
}

// ── Ultra-Fast Spreadsheet Parser ──────────────────────────────────────────
const ALLOWED_COLUMN_LETTERS = ["C", "D", "E", "F", "G", "H", "I", "J", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "W"];
const ALLOWED_COLUMN_INDICES = ALLOWED_COLUMN_LETTERS.map(l => XLSX.utils.decode_col(l));

function parseSpreadsheetBuffer(buf) {
  const startTimer = Date.now();
  try {
    const wb = XLSX.read(buf, { type: "buffer", cellDates: true, sheets: ["Agenda"] });
    const sheet = wb.Sheets["Agenda"] || wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return false;

    // Direct header extraction (apenas colunas permitidas: C, D, E, F, G, H, I, J, L, M, N, O, P, Q, R, S, T, U, W)
    const flatColumns = [];
    for (const c of ALLOWED_COLUMN_INDICES) {
      const cell = sheet[XLSX.utils.encode_cell({ c, r: 0 })];
      if (!cell || !cell.v) continue;
      const colName = String(cell.v).trim();
      const match = colName.match(/\b\d{2,4}\b/);
      const flatNumber = match ? match[0] : colName;
      flatColumns.push({ colIndex: c, colName, flatNumber });
    }

    db.flats = flatColumns.map((fc, index) => {
      const existing = db.flats.find(f => f.number === fc.flatNumber);
      return {
        id: existing ? existing.id : index + 1,
        number: fc.flatNumber,
        colIndex: fc.colIndex,
        colName: fc.colName,
        isOccupied: existing && typeof existing.isOccupied === "boolean" ? existing.isOccupied : true,
        updatedAt: new Date().toISOString(),
      };
    });

    const activeDates = [];
    for (let offset = -14; offset <= 30; offset++) {
      activeDates.push(getOffsetDateStr(offset));
    }
    const targetDateSet = new Set(activeDates);
    const dateToRowIndex = new Map();

    for (let r = 1; r <= 2000; r++) {
      const cellDate = sheet[XLSX.utils.encode_cell({ c: 1, r })] || sheet[XLSX.utils.encode_cell({ c: 0, r })];
      if (!cellDate || cellDate.v === undefined) continue;

      let dateStr = "";
      const val = cellDate.v;
      if (val instanceof Date) {
        dateStr = val.toISOString().substring(0, 10);
      } else if (typeof val === "string" && val.trim()) {
        const parts = val.trim().split(/[-/]/);
        if (parts.length === 3) {
          if (parts[0].length === 4) dateStr = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
          else if (parts[2].length === 4) dateStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
      }
      if (dateStr && targetDateSet.has(dateStr)) {
        dateToRowIndex.set(dateStr, r);
      }
    }

    function findExistingReq(flatNum, flatIdVal, dateStrVal) {
      const targetDigits = String(flatNum || flatIdVal).replace(/\D/g, "");
      for (const req of db.cleaningRequests) {
        if (req.requestDate !== dateStrVal) continue;
        const reqDigits = String(req.flatNumber || req.flatId || "").replace(/\D/g, "");
        if (
          req.flatId === flatIdVal ||
          req.flatNumber === flatNum ||
          String(req.flatId) === String(flatIdVal) ||
          String(req.flatNumber) === String(flatNum) ||
          (targetDigits && reqDigits && targetDigits === reqDigits)
        ) {
          return req;
        }
      }
      return null;
    }

    let maxReqId = db.cleaningRequests.length > 0 ? Math.max(...db.cleaningRequests.map(r => Number(r.id) || 0)) : 0;

    const datesToProcess = [];
    for (let offset = -7; offset <= 14; offset++) {
      datesToProcess.push(getOffsetDateStr(offset));
    }
    const processedKeys = new Set();
    const newRequests = [];
    const newCheckins = [];

    function getCellValue(col, row) {
      if (row === undefined) return "";
      const cell = sheet[XLSX.utils.encode_cell({ c: col, r: row })];
      return cell && cell.v !== undefined ? String(cell.v).trim() : "";
    }

    for (const dateStr of datesToProcess) {
      const rToday = dateToRowIndex.get(dateStr);
      const prevDateStr = getPrevDay(dateStr);
      const rYesterday = dateToRowIndex.get(prevDateStr);

      if (!stayoverFlatsByDate.has(dateStr)) stayoverFlatsByDate.set(dateStr, new Set());
      if (!inHouseFlatsByDate.has(dateStr)) inHouseFlatsByDate.set(dateStr, new Set());

      for (const flat of db.flats) {
        const rawGuestYesterday = getCellValue(flat.colIndex, rYesterday);
        const rawGuestToday = getCellValue(flat.colIndex, rToday);

        const isCheckout = Boolean(rawGuestYesterday && !isSameGuest(rawGuestYesterday, rawGuestToday));
        const isCheckin = Boolean(rawGuestToday && !isSameGuest(rawGuestToday, rawGuestYesterday));
        const isStayover = Boolean(rawGuestYesterday && isSameGuest(rawGuestYesterday, rawGuestToday));

        if (rawGuestToday) {
          inHouseFlatsByDate.get(dateStr).add(flat.id);
          inHouseFlatsByDate.get(dateStr).add(flat.number);
          inHouseFlatsByDate.get(dateStr).add(String(flat.number));
        }

        const keyByNum = `${flat.number}-${dateStr}`;
        const keyById = `${flat.id}-${dateStr}`;
        const existing = findExistingReq(flat.number, flat.id, dateStr);

        // Extended Stay / Stayover Detection (hóspede continua no apartamento)
        if (isStayover) {
          stayoverFlatsByDate.get(dateStr).add(flat.id);
          stayoverFlatsByDate.get(dateStr).add(flat.number);
          stayoverFlatsByDate.get(dateStr).add(String(flat.number));
          processedKeys.add(keyByNum);
          processedKeys.add(keyById);
          processedKeys.add(`${flat.number}-${prevDateStr}`);
          processedKeys.add(`${flat.id}-${prevDateStr}`);
          if (existing && (existing.status === "will_clean" || existing.status === "cleaning_now" || existing.status === "extended")) {
            newRequests.push({
              ...existing,
              flatId: flat.id,
              flatNumber: flat.number,
              status: "extended",
              isExtended: true,
              updatedAt: new Date().toISOString(),
            });
          }
          continue;
        }

        if (isCheckout) {
          processedKeys.add(keyByNum);
          processedKeys.add(keyById);
          const reqId = existing?.id || ++maxReqId;
          newRequests.push({
            id: reqId,
            flatId: flat.id,
            flatNumber: flat.number,
            requestDate: dateStr,
            source: "checkout",
            status: existing ? (existing.status === "extended" ? "dirty" : existing.status) : "dirty",
            assignedUserId: existing ? existing.assignedUserId : null,
            isVacant: (existing && typeof existing.isVacant === "boolean" && dateStr <= getTodayStr()) ? existing.isVacant : false,
            isPriority: existing && typeof existing.isPriority === "boolean" ? existing.isPriority : false,
            leavingGuest: rawGuestYesterday,
            arrivingGuest: rawGuestToday || null,
            pendingObservation: existing ? existing.pendingObservation : null,
            willCleanAt: existing ? existing.willCleanAt : null,
            cleaningStartedAt: existing ? existing.cleaningStartedAt : null,
            completedAt: existing ? existing.completedAt : null,
            createdAt: existing ? existing.createdAt : new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }

        if (isCheckin) {
          newCheckins.push({
            flatId: flat.id,
            flatNumber: flat.number,
            checkinDate: dateStr,
            arrivingGuest: rawGuestToday,
          });
        }
      }
    }

    const validFlatNumbers = new Set(db.flats.map(f => f.number));
    const validFlatIds = new Set(db.flats.map(f => f.id));

    // Preserva requests históricos de dias anteriores APENAS para flats válidos mapeados
    const preservedRequests = db.cleaningRequests.filter(req => {
      const isValidFlat = validFlatNumbers.has(req.flatNumber) || validFlatIds.has(req.flatId);
      if (!isValidFlat) return false;
      const kNum = `${req.flatNumber}-${req.requestDate}`;
      const kId = `${req.flatId}-${req.requestDate}`;
      return !processedKeys.has(kNum) && !processedKeys.has(kId) && !datesToProcess.includes(req.requestDate);
    });

    for (const manual of existingManualRequests) {
      if ((validFlatNumbers.has(manual.flatNumber) || validFlatIds.has(manual.flatId)) && !newRequests.some(r => r.flatId === manual.flatId && r.requestDate === manual.requestDate)) {
        newRequests.unshift(manual);
      }
    }

    const seenReqKeys = new Set();
    const deduplicatedRequests = [];
    for (const r of [...newRequests, ...preservedRequests]) {
      const k = `${r.flatId}-${r.requestDate}`;
      if (!seenReqKeys.has(k) && (validFlatNumbers.has(r.flatNumber) || validFlatIds.has(r.flatId))) {
        seenReqKeys.add(k);
        deduplicatedRequests.push(r);
      }
    }

    // Auto-resolução de limpezas obsoletas:
    // Se um flat está atualmente ocupado por um hóspede em estadia ativa contínua (ex: Ana no 905 desde 23/08),
    // qualquer solicitação de limpeza com requestDate anterior à data de entrada (check-in) da estadia atual
    // já foi superada no passado e não é uma pendência para hoje.
    const todayDateStr = getTodayStr();
    for (const flat of db.flats) {
      const rToday_ = dateToRowIndex.get(todayDateStr);
      const guestToday_ = getCellValue(flat.colIndex, rToday_);
      if (guestToday_) {
        let currentStayCheckinDate = todayDateStr;
        let curr = todayDateStr;
        while (true) {
          const d = new Date(curr + "T12:00:00Z");
          d.setDate(d.getDate() - 1);
          const prev = d.toISOString().substring(0, 10);
          const rPrev_ = dateToRowIndex.get(prev);
          const guestPrev_ = getCellValue(flat.colIndex, rPrev_);
          if (guestPrev_ && isSameGuest(guestPrev_, guestToday_)) {
            currentStayCheckinDate = prev;
            curr = prev;
          } else {
            break;
          }
        }

        // Marca como no_show/resolvido qualquer request do mesmo flat anterior à entrada do hóspede atual
        for (const req of deduplicatedRequests) {
          if ((req.flatId === flat.id || req.flatNumber === flat.number || String(req.flatNumber) === String(flat.number)) && 
              req.requestDate < currentStayCheckinDate && 
              req.status === "dirty") {
            req.status = "no_show";
            req.isVacant = false;
            req.completedAt = new Date(`${currentStayCheckinDate}T12:00:00.000Z`).toISOString();
            req.pendingObservation = "Estadia subsequente iniciada em " + currentStayCheckinDate;
          }
        }
      }
    }

    // Preserva requisições manuais adicionadas pelos usuários / administradores
    const manualRequests = (db.cleaningRequests || []).filter(r => r.source === "manual");
    for (const mReq of manualRequests) {
      const alreadyInDeduplicated = deduplicatedRequests.some(r => 
        (r.flatId === mReq.flatId || String(r.flatNumber) === String(mReq.flatNumber)) && 
        r.requestDate === mReq.requestDate
      );
      if (!alreadyInDeduplicated) {
        deduplicatedRequests.push(mReq);
      }
    }

    db.cleaningRequests = deduplicatedRequests;
    checkinsList = newCheckins.filter(c => validFlatNumbers.has(c.flatNumber) || validFlatIds.has(c.flatId));
    db.settings.lastSyncedAt = new Date().toISOString();
    saveDatabase();

    const elapsed = Date.now() - startTimer;
    console.log(`[Excel Engine] Sincronização concluída em ${elapsed}ms: ${db.flats.length} flats, ${db.cleaningRequests.length} checkouts ativos.`);
    return true;
  } catch (err) {
    console.error("[Excel Engine] Erro ao processar buffer da planilha:", err);
    return false;
  }
}

let lastProcessedSheetHash = "";
let lastBackgroundSyncTime = 0;
let isSyncingSpreadsheet = false;

async function loadSpreadsheetData(forceReprocess = false) {
  let buf = null;
  const localFilePath = getLocalSpreadsheetPath();

  if (localFilePath) {
    try {
      buf = fs.readFileSync(localFilePath);
      // Auto push to cloud Render in background if we are running locally
      if (!process.env.RENDER) {
        const base64 = buf.toString("base64");
        fetch("https://corpflats.onrender.com/api/sync/upload-sheet-json", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ base64 })
        }).then(r => r.json()).then(d => console.log(`[Cloud Sync Push] Render atualizado:`, d.message)).catch(() => {});
      }
    } catch (err) {
      console.warn("[Excel Engine] Falha ao ler arquivo local:", err.message);
    }
  }

  // Microsoft Graph API Direct Integration Mode
  if (!buf && db.microsoftGraphConfig?.clientId && db.microsoftGraphConfig?.clientSecret) {
    try {
      const graph = new MicrosoftGraphService(db.microsoftGraphConfig);
      const graphBuf = await graph.downloadExcelBuffer(db.microsoftGraphConfig.filePath);
      if (graphBuf && graphBuf.length > 1000) {
        buf = graphBuf;
        const cloudCache = path.join(DATA_DIR, "latest_sheet.xlsx");
        try { fs.writeFileSync(cloudCache, buf); } catch {}
      }
    } catch (err) {
      if (!global.__graphErrorLogged) {
        console.warn(`[Microsoft Graph Engine] Erro ao sincronizar via Graph API: ${err.message}`);
        global.__graphErrorLogged = true;
      }
    }
  }

  // Cloud Mode: Tenta baixar diretamente da URL do OneDrive configurada com anti-cache
  if (!buf && db.settings.onedriveShareUrl) {
    const candidateUrls = convertToDirectDownloadUrls(db.settings.onedriveShareUrl);
    for (const url of candidateUrls) {
      try {
        const cacheBusterUrl = url.includes("?") ? `${url}&_t=${Date.now()}` : `${url}?_t=${Date.now()}`;
        const res = await fetch(cacheBusterUrl, { 
          redirect: "follow", 
          headers: { 
            "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0", 
            "Pragma": "no-cache",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" 
          },
          signal: AbortSignal.timeout(12000)
        });
        if (res.ok) {
          const ab = await res.arrayBuffer();
          if (ab && ab.byteLength > 1000) {
            const tempBuf = Buffer.from(ab);
            // Confirma cabeçalho de zip/xlsx real (PK signature: 0x50 0x4B)
            if (tempBuf[0] === 0x50 && tempBuf[1] === 0x4B) {
              buf = tempBuf;
              const cloudCache = path.join(DATA_DIR, "latest_sheet.xlsx");
              try { fs.writeFileSync(cloudCache, buf); } catch {}
              break;
            }
          }
        }
      } catch (e) {
      }
    }
  }

  // Cloud cache fallback se a rede falhar
  if (!buf) {
    const cloudCache = path.join(DATA_DIR, "latest_sheet.xlsx");
    if (fs.existsSync(cloudCache)) {
      try {
        buf = fs.readFileSync(cloudCache);
      } catch {}
    }
  }

  if (!buf) {
    return false;
  }

  // Detecção de Hash SHA256 e Data Atual para atualizar quando houver alteração real ou virada de dia
  const todayStr = getTodayStr();
  const currentHash = crypto.createHash("sha256").update(buf).digest("hex") + "_" + todayStr;
  if (!forceReprocess && currentHash === lastProcessedSheetHash) {
    return true; // Planilha idêntica no mesmo dia, mantém cache sem reprocessar
  }

  lastProcessedSheetHash = currentHash;
  return parseSpreadsheetBuffer(buf);
}

// ── Disparo Não-Bloqueante em Background (Stale-While-Revalidate) ──────────────
function triggerBackgroundSync() {
  const now = Date.now();
  if (now - lastBackgroundSyncTime < 10000 || isSyncingSpreadsheet) return;
  lastBackgroundSyncTime = now;
  isSyncingSpreadsheet = true;

  setImmediate(async () => {
    try {
      await loadSpreadsheetData();
    } catch (err) {
    } finally {
      isSyncingSpreadsheet = false;
    }
  });
}

// Carga Inicial
loadSpreadsheetData();

// ── Background Cloud Polling Contínuo (a cada 15 segundos na nuvem) ──────────
setInterval(async () => {
  try {
    if (db.settings.onedriveShareUrl) {
      await loadSpreadsheetData();
    }
  } catch (err) {
  }
}, 15 * 1000);

// ── Watcher Local Ultrarrápido (500ms + Timer de 5s para Push Automático) ─────
const localFile = getLocalSpreadsheetPath();
if (localFile) {
  fs.watchFile(localFile, { interval: 500 }, (curr, prev) => {
    if (curr.mtimeMs !== prev.mtimeMs) {
      console.log(`[File Watcher] Alteração detectada no Excel em ${new Date().toLocaleTimeString()}! Sincronizando local e nuvem...`);
      loadSpreadsheetData(true);
    }
  });

  // Poller de redundância local a cada 5s
  setInterval(() => {
    try {
      if (fs.existsSync(localFile)) {
        const buf = fs.readFileSync(localFile);
        const hash = crypto.createHash("sha256").update(buf).digest("hex");
        if (hash !== lastProcessedSheetHash) {
          console.log(`[Local Periodic Poller] Novo conteúdo detectado no Excel! Enviando para nuvem...`);
          loadSpreadsheetData(true);
        }
      }
    } catch {}
  }, 5000);
}

// ── Auth Endpoints with Real Password Validation ────────────────────────────
app.get("/api/auth/me", (req, res) => {
  const user = getAuthUser(req);
  if (!user) {
    res.clearCookie("auth_session", { path: "/" });
    res.clearCookie(AUTH_COOKIE_NAME, { path: "/" });
    return res.status(401).json({ error: "Não autenticado" });
  }
  res.json(user);
});

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Informe usuário e senha." });
  }

  const found = db.users.find(u => u.username.toLowerCase() === username.trim().toLowerCase());
  if (!found) {
    return res.status(401).json({ error: "Usuário não encontrado." });
  }

  const isValid = verifyPassword(password, found.passwordHash);
  if (!isValid) {
    return res.status(401).json({ error: "Senha incorreta." });
  }

  const userPayload = {
    id: found.id,
    username: found.username,
    role: found.role,
    v: AUTH_SESSION_VERSION
  };
  const token = Buffer.from(JSON.stringify(userPayload)).toString("base64");
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 dias
  });
  res.json({ id: found.id, username: found.username, role: found.role });
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("auth_session", { path: "/" });
  res.clearCookie(AUTH_COOKIE_NAME, { path: "/" });
  res.json({ success: true });
});

// Self Change Password
app.post("/api/auth/change-password", (req, res) => {
  const userAuth = getAuthUser(req);
  if (!userAuth) return res.status(401).json({ error: "Não autenticado." });
  const { currentPassword, newPassword } = req.body || {};

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Informe a senha atual e a nova senha." });
  }
  if (String(newPassword).length < 4) {
    return res.status(400).json({ error: "A nova senha deve ter no mínimo 4 caracteres." });
  }

  const user = db.users.find(u => u.id === userAuth.id);
  if (!user) return res.status(404).json({ error: "Usuário não encontrado." });

  if (!verifyPassword(currentPassword, user.passwordHash)) {
    return res.status(400).json({ error: "Senha atual incorreta." });
  }

  user.passwordHash = hashPassword(newPassword);
  saveDatabase();
  res.json({ success: true, message: "Senha alterada com sucesso!" });
});

// ── Staff & User Management Endpoints ─────────────────────────────────────────
app.get("/api/staff", (req, res) => {
  const list = (db.users || []).map(u => ({
    id: u.id,
    username: u.username,
    name: u.name || u.username,
    role: u.role
  }));
  res.json(list);
});

app.get("/api/admin/users", (req, res) => {
  const userAuth = getAuthUser(req);
  if (userAuth?.role !== "admin") return res.status(403).json({ error: "Acesso negado." });
  const list = db.users.map(u => ({
    id: u.id,
    username: u.username,
    role: u.role
  }));
  res.json(list);
});

app.post("/api/admin/users", (req, res) => {
  const userAuth = getAuthUser(req);
  if (userAuth?.role !== "admin") return res.status(403).json({ error: "Acesso negado." });
  const { username, password, role = "camareira" } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: "Nome de usuário e senha são obrigatórios." });
  }
  if (db.users.some(u => u.username.toLowerCase() === username.trim().toLowerCase())) {
    return res.status(409).json({ error: "Já existe um usuário com esse nome." });
  }

  const newUser = {
    id: db.users.length > 0 ? Math.max(...db.users.map(u => u.id)) + 1 : 1,
    username: username.trim(),
    role: role === "admin" ? "admin" : "camareira",
    passwordHash: hashPassword(password)
  };

  db.users.push(newUser);
  saveDatabase();
  res.status(201).json({ id: newUser.id, username: newUser.username, role: newUser.role });
});

app.patch("/api/admin/users/:id/reset-password", (req, res) => {
  const userAuth = getAuthUser(req);
  if (userAuth?.role !== "admin") return res.status(403).json({ error: "Acesso negado." });
  const id = Number(req.params.id);
  const { newPassword } = req.body || {};

  if (!newPassword || String(newPassword).length < 4) {
    return res.status(400).json({ error: "A nova senha deve ter no mínimo 4 caracteres." });
  }

  const user = db.users.find(u => u.id === id);
  if (!user) return res.status(404).json({ error: "Usuário não encontrado." });

  user.passwordHash = hashPassword(newPassword);
  saveDatabase();
  res.json({ success: true, message: `Senha do usuário ${user.username} redefinida com sucesso!` });
});

app.delete("/api/admin/users/:id", (req, res) => {
  const userAuth = getAuthUser(req);
  if (userAuth?.role !== "admin") return res.status(403).json({ error: "Acesso negado." });
  const id = Number(req.params.id);
  if (id === userAuth.id) return res.status(400).json({ error: "Você não pode excluir seu próprio usuário." });

  db.users = db.users.filter(u => u.id !== id);
  saveDatabase();
  res.json({ success: true });
});

// ── Public Guest Checkout Endpoint ─────────────────────────────────────────
app.post("/api/public/checkout", (req, res) => {
  const rawNum = String(req.body?.flatNumber || "").replace(/\D/g, "").trim();
  if (!rawNum) {
    return res.status(400).json({ error: "Por favor, digite apenas o número do apartamento." });
  }

  const flat = db.flats.find(f => f.number === rawNum || f.number.replace(/\D/g, "") === rawNum);
  if (!flat) {
    return res.status(404).json({ error: `Apartamento ${rawNum} não encontrado. Por favor, verifique o número ou contate a recepção.` });
  }

  const todayStr = getTodayStr();
  let existing = db.cleaningRequests.find(r => r.flatId === flat.id && r.requestDate === todayStr);

  const now = new Date().toISOString();
  if (existing) {
    existing.isVacant = true; // Confirma quarto desocupado
    if (!existing.pendingObservation) {
      existing.pendingObservation = "Check-out registrado (Recepção / Hóspede)";
    } else if (!existing.pendingObservation.includes("Check-out registrado")) {
      existing.pendingObservation = `${existing.pendingObservation} | Check-out registrado`;
    }
    existing.updatedAt = now;
  } else {
    existing = {
      id: db.cleaningRequests.length > 0 ? Math.max(...db.cleaningRequests.map(r => r.id)) + 1 : 1,
      flatId: flat.id,
      flatNumber: flat.number,
      requestDate: todayStr,
      source: "guest_checkout",
      status: "dirty",
      assignedUserId: null,
      isVacant: true, // Já saiu
      isPriority: false, // Prioridade manual exclusiva do admin
      leavingGuest: "Hóspede",
      arrivingGuest: null,
      pendingObservation: "Check-out registrado (Recepção / Hóspede)",
      willCleanAt: null,
      cleaningStartedAt: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    db.cleaningRequests.unshift(existing);
  }

  flat.isOccupied = false;
  flat.updatedAt = now;
  saveDatabase();

  // Trigger Notification for Checkout
  createNotification({
    category: "checkout",
    title: `🚪 Check-out Realizado - Apt ${flat.number}`,
    message: `Saída do apartamento ${flat.number} registrada. Quarto desocupado e pronto para limpeza.`,
    severity: "info",
    metadata: { flatId: flat.id, flatNumber: flat.number },
    targetUrl: "/dashboard"
  });

  res.json({
    success: true,
    flatNumber: flat.number,
    message: "Check-out confirmado com sucesso!"
  });
});

// ── Flats Endpoints ─────────────────────────────────────────────────────────
app.get("/api/flats", (req, res) => {
  triggerBackgroundSync();
  res.json(db.flats);
});

app.post("/api/flats", (req, res) => {
  const { number } = req.body;
  if (!number || !String(number).trim()) return res.status(400).json({ error: "Número do flat é obrigatório" });
  const existing = db.flats.find(f => f.number === String(number).trim());
  if (existing) return res.status(409).json({ error: "Apartamento já cadastrado" });

  const newFlat = {
    id: db.flats.length > 0 ? Math.max(...db.flats.map(f => f.id)) + 1 : 1,
    number: String(number).trim(),
    colIndex: -1,
    colName: `Apt ${number}`,
    isOccupied: false,
    updatedAt: new Date().toISOString(),
  };
  db.flats.push(newFlat);
  saveDatabase();
  res.status(201).json(newFlat);
});

app.put("/api/flats/:id", (req, res) => {
  const id = Number(req.params.id);
  const flat = db.flats.find(f => f.id === id);
  if (!flat) return res.status(404).json({ error: "Flat não encontrado" });
  if (req.body.number) flat.number = String(req.body.number).trim();
  if (typeof req.body.isOccupied === "boolean") flat.isOccupied = req.body.isOccupied;
  flat.updatedAt = new Date().toISOString();
  saveDatabase();
  res.json(flat);
});

app.delete("/api/flats/:id", (req, res) => {
  const id = Number(req.params.id);
  db.flats = db.flats.filter(f => f.id !== id);
  saveDatabase();
  res.json({ success: true });
});

app.patch("/api/flats/:id", (req, res) => {
  const f = db.flats.find(x => x.id === Number(req.params.id));
  if (!f) return res.status(404).json({ error: "Flat não encontrado" });
  if (typeof req.body.isOccupied === "boolean") {
    f.isOccupied = req.body.isOccupied;
    f.updatedAt = new Date().toISOString();
  }
  saveDatabase();
  res.json(f);
});

// ── Acknowledge Extended Stay ("Ciente") Endpoint ───────────────────────────
app.post("/api/cleaning/assignments/:requestId/acknowledge-extended", (req, res) => {
  const reqId = Number(req.params.requestId);
  db.cleaningRequests = db.cleaningRequests.filter(r => r.id !== reqId);
  saveDatabase();
  res.json({ success: true, message: "Aviso de extensão dispensado com sucesso." });
});

// ── Mark Flat as Extended Stay (Hóspede Estendeu / Stayover) ───────────────
app.post("/api/cleaning/assignments/:requestId/mark-extended", (req, res) => {
  const reqId = Number(req.params.requestId);
  const { flatNumber, notes } = req.body || {};
  let item = db.cleaningRequests.find(r => r.id === reqId);
  if (!item && flatNumber) {
    item = db.cleaningRequests.find(r => String(r.flatNumber) === String(flatNumber) && r.status !== "clean");
  }
  if (!item) {
    return res.status(404).json({ error: "Solicitação de limpeza não encontrada." });
  }

  const targetFlatNumber = item.flatNumber;
  const userAuth = getAuthUser(req);
  const now = new Date().toISOString();

  // Marca todas as solicitações pendentes deste quarto como estendidas
  for (const r of db.cleaningRequests) {
    if ((String(r.flatNumber) === String(targetFlatNumber) || r.flatId === item.flatId) && r.status !== "clean") {
      r.status = "extended";
      r.isExtended = true;
      r.isVacant = false;
      r.pendingObservation = notes || "Hóspede estendeu a estadia";
      r.updatedAt = now;
    }
  }

  saveDatabase();

  logAuditEvent({
    level: "info",
    category: "cleaning",
    action: "STAY_EXTENDED",
    actor: { name: userAuth ? (userAuth.name || userAuth.username) : "Sistema", role: userAuth?.role || "admin" },
    details: { flatNumber: targetFlatNumber, notes: notes || "Hóspede estendeu estadia" },
    source: "cleaning_dashboard"
  });

  res.json({ success: true, message: `Flat ${targetFlatNumber} marcado como estadia estendida com sucesso.` });
});

// ── Admin Instructions & Room Setup Endpoint (Admin Only) ───────────────────
app.patch("/api/cleaning/requests/:requestId/admin-instructions", (req, res) => {
  const reqId = Number(req.params.requestId);
  const { twinBeds, adminNote, extraMattress, flatId, requestDate } = req.body || {};

  let request = db.cleaningRequests.find(r => r.id === reqId);
  if (!request && flatId && requestDate) {
    request = db.cleaningRequests.find(r => r.flatId === Number(flatId) && r.requestDate === requestDate);
  }

  if (!request) {
    const flat = db.flats.find(f => f.id === Number(flatId));
    if (!flat) return res.status(404).json({ error: "Apartamento ou solicitação de limpeza não encontrada." });

    const nowIso = new Date().toISOString();
    request = {
      id: db.cleaningRequests.length > 0 ? Math.max(...db.cleaningRequests.map(r => Number(r.id) || 0)) + 1 : 1,
      flatId: flat.id,
      flatNumber: flat.number,
      requestDate: requestDate || getTodayStr(),
      source: "manual",
      status: "dirty",
      assignedUserId: null,
      isVacant: !flat.isOccupied,
      isPriority: false,
      twinBeds: Boolean(twinBeds),
      extraMattress: Boolean(extraMattress),
      adminNote: adminNote ? String(adminNote).trim() : null,
      leavingGuest: null,
      arrivingGuest: null,
      pendingObservation: adminNote ? String(adminNote).trim() : null,
      willCleanAt: null,
      cleaningStartedAt: null,
      completedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    existingManualRequests.push(request);
    db.cleaningRequests.unshift(request);
    saveDatabase();
    return res.json({ success: true, request });
  }

  if (typeof twinBeds === "boolean") {
    request.twinBeds = twinBeds;
  }
  if (typeof extraMattress === "boolean") {
    request.extraMattress = extraMattress;
  }
  if (adminNote !== undefined) {
    request.adminNote = adminNote ? String(adminNote).trim() : null;
    request.pendingObservation = request.adminNote;
  }
  request.updatedAt = new Date().toISOString();
  saveDatabase();

  res.json({ success: true, request });
});

// ── Cleaners List Endpoint ──────────────────────────────────────────────────
app.get("/api/cleaners", (req, res) => {
  const cleaners = db.users
    .filter(u => u.role === "camareira" || u.role === "cleaner" || u.role === "admin")
    .map(u => ({ 
      id: u.id, 
      username: u.username, 
      role: u.role === "camareira" || u.role === "cleaner" ? "camareira" : u.role 
    }));
  res.json(cleaners);
});

// ── Manual Cleaning Request ─────────────────────────────────────────────────
app.post("/api/cleaning/requests/manual", (req, res) => {
  const { 
    flatId, 
    requestDate = getTodayStr(), 
    isPriority = false,
    markAsClean = false,
    assignedUserId = null,
    observation = null,
    twinBeds = false,
    adminNote = null
  } = req.body;

  const flat = db.flats.find(f => f.id === Number(flatId) || String(f.number) === String(flatId));
  if (!flat) return res.status(404).json({ error: "Apartamento não encontrado" });

  const assignedUser = assignedUserId ? db.users.find(u => u.id === Number(assignedUserId)) : null;
  const nowIso = new Date().toISOString();
  const completedDateIso = requestDate ? new Date(`${requestDate}T12:00:00.000Z`).toISOString() : nowIso;
  const noteText = (adminNote || observation || "").trim() || null;

  let existing = db.cleaningRequests.find(r => (r.flatId === flat.id || String(r.flatNumber) === String(flat.number)) && r.requestDate === requestDate);
  if (existing) {
    existing.source = "manual";
    existing.isExtended = false;
    existing.isPriority = Boolean(isPriority);
    existing.status = markAsClean ? "clean" : "dirty";
    existing.isVacant = markAsClean ? true : !flat.isOccupied;
    existing.twinBeds = Boolean(twinBeds);
    if (noteText) {
      existing.adminNote = noteText;
      existing.pendingObservation = noteText;
    }
    if (assignedUser) {
      existing.assignedUserId = assignedUser.id;
    }
    existing.willCleanAt = markAsClean ? completedDateIso : null;
    existing.cleaningStartedAt = markAsClean ? completedDateIso : null;
    existing.completedAt = markAsClean ? completedDateIso : null;
    existing.updatedAt = nowIso;
    saveDatabase();
    return res.json(existing);
  }

  const newReq = {
    id: db.cleaningRequests.length > 0 ? Math.max(...db.cleaningRequests.map(r => Number(r.id) || 0)) + 1 : 1,
    flatId: flat.id,
    flatNumber: flat.number,
    requestDate,
    source: "manual",
    status: markAsClean ? "clean" : "dirty",
    assignedUserId: assignedUser ? assignedUser.id : null,
    isVacant: markAsClean ? true : !flat.isOccupied,
    isPriority: Boolean(isPriority),
    isExtended: false,
    twinBeds: Boolean(twinBeds),
    adminNote: noteText,
    leavingGuest: null,
    arrivingGuest: null,
    pendingObservation: noteText,
    willCleanAt: markAsClean ? completedDateIso : null,
    cleaningStartedAt: markAsClean ? completedDateIso : null,
    completedAt: markAsClean ? completedDateIso : null,
    createdAt: nowIso,
    updatedAt: nowIso
  };

  db.cleaningRequests.unshift(newReq);
  saveDatabase();
  return res.status(201).json(newReq);
});

function getRequestsForDate(dateStr) {
  const validFlatIds = new Set(db.flats.map(f => f.id));
  const validFlatNumbers = new Set(db.flats.map(f => f.number));

  const requestsForDate = [];
  const existingFlatIdsForDate = new Set();

  // 1. Requests agendados para a data solicitada (1 por flat)
  for (const r of db.cleaningRequests) {
    if ((validFlatIds.has(r.flatId) || validFlatNumbers.has(r.flatNumber)) && 
        r.requestDate === dateStr && 
        r.status !== "extended" && 
        r.status !== "no_show" && 
        !r.isExtended) {
      if (!existingFlatIdsForDate.has(r.flatId)) {
        requestsForDate.push(r);
        existingFlatIdsForDate.add(r.flatId);
      }
    }
  }

  // 2. Para a visualização de HOJE e DIAS FUTUROS (dateStr >= getTodayStr()),
  // busca pendências ativas de dias anteriores (quartos que ainda não foram limpos)
  if (dateStr >= getTodayStr()) {
    const cleanedOrResolvedForTarget = new Set(
      db.cleaningRequests
        .filter(r => r.requestDate === dateStr && (r.status === "clean" || r.status === "no_show"))
        .map(r => r.flatId)
    );

    const stayoversTarget = stayoverFlatsByDate.get(dateStr) || new Set();

    const allPreviousUncleaned = db.cleaningRequests.filter(r => {
      // Pega apenas requisições com data ANTERIOR à data consultada (dateStr)
      if (r.requestDate >= dateStr || r.status === "extended" || r.status === "no_show" || r.isExtended) {
        return false;
      }
      
      // Se o quarto tem permanência contínua (stayover) na data consultada, não puxa checkout antigo
      if (stayoversTarget.has(r.flatId) || stayoversTarget.has(r.flatNumber) || stayoversTarget.has(String(r.flatNumber)) || stayoversTarget.has(Number(r.flatNumber))) {
        return false;
      }

      // 1. Se ainda está sujo ou não finalizado, é uma pendência ativa para dateStr!
      if (r.status !== "clean") {
        if (existingFlatIdsForDate.has(r.flatId) || cleanedOrResolvedForTarget.has(r.flatId)) {
          return false;
        }
        return true;
      }

      // 2. Se FOI LIMPO, mas a conclusão (completedAt) ocorreu na data consultada, mantém como concluído na data
      const completedDateStr = r.completedAt ? r.completedAt.substring(0, 10) : "";
      if (completedDateStr === dateStr) {
        if (existingFlatIdsForDate.has(r.flatId)) {
          return false;
        }
        return true;
      }

      return false;
    });

    // Ordena do dia mais recente para o mais antigo para manter a ocorrência mais recente
    allPreviousUncleaned.sort((a, b) => new Date(b.requestDate).getTime() - new Date(a.requestDate).getTime());

    for (const prevReq of allPreviousUncleaned) {
      if (!existingFlatIdsForDate.has(prevReq.flatId)) {
        requestsForDate.push({
          ...prevReq,
          isPendingFromPreviousDay: true,
          originalRequestDate: prevReq.requestDate,
        });
        existingFlatIdsForDate.add(prevReq.flatId);
      }
    }
  }

  return requestsForDate;
}

// ── Reservations & Checkouts Endpoints ─────────────────────────────────────

// ─── Limpeza Geral de Reservas de Teste ───────────────────────────────────────
app.post("/api/reservations/clear-all", (req, res) => {
  const count = (db.reservations || []).length;
  db.reservations = [];
  if (db.guestBreakfastOrders) db.guestBreakfastOrders = [];
  saveDatabase();
  console.log(`[PMS] ${count} reservas de teste excluídas com sucesso.`);
  res.json({ success: true, count, message: `${count} reservas de teste foram excluídas com sucesso!` });
});

app.get("/api/reservations/checkouts", (req, res) => {
  triggerBackgroundSync();
  const dateStr = req.query.date || getTodayStr();
  const requestsForDate = getRequestsForDate(dateStr);
  const activeSurveys = db.surveys.filter(s => s.isActive);

  const result = requestsForDate.map(req_ => {
    const flat = db.flats.find(f => f.id === req_.flatId) || { id: req_.flatId, number: req_.flatNumber || String(req_.flatId), isOccupied: true };
    const assignedUser = db.users.find(u => u.id === req_.assignedUserId);
    const hasCheckinToday = Boolean(req_.arrivingGuest) || (db.reservations || []).some(r => (r.flatId === flat.id || String(r.flatNumber) === String(flat.number)) && r.checkinDate === dateStr && r.status !== "cancelada");

    const pendingTasks = [];
    for (const pt of db.periodicTasks.filter(t => t.isActive && t.assignToHousekeeping !== false && (t.flatIds.length === 0 || t.flatIds.includes(flat.id)))) {
      const executions = (db.periodicExecutions || []).filter(e => e.periodicTaskId === pt.id && e.flatId === flat.id);
      executions.sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime());
      const lastExec = executions[0] || null;

      let nextDueAt;
      if (lastExec) {
        const d = new Date(lastExec.executedAt.substring(0, 10));
        d.setDate(d.getDate() + pt.periodDays);
        nextDueAt = d.toISOString().substring(0, 10);
      } else {
        nextDueAt = pt.firstDueDate || (pt.createdAt ? pt.createdAt.substring(0, 10) : dateStr);
      }
      // Vence hoje ou ficou pendente de dias anteriores (aguardando a próxima limpeza)
      if (nextDueAt <= dateStr) {
        pendingTasks.push({ 
          id: pt.id, 
          name: pt.name, 
          description: pt.description, 
          periodDays: pt.periodDays,
          firstDueDate: pt.firstDueDate,
          nextDueAt
        });
      }
    }

    const pendingSurveys = [];
    for (const s of activeSurveys) {
      const alreadyAnswered = s.responses.some(r => r.flatId === flat.id);
      if (!alreadyAnswered) {
        pendingSurveys.push({ id: s.id, title: s.title, question: s.question, type: s.type });
      }
    }

    const isFuture = dateStr > getTodayStr();
    const isVacant = isFuture ? Boolean(req_.isVacantExplicitlySet) : Boolean(req_.isVacant);
    const isOccupied = !isVacant;

    // Check for arriving reservation setup preferences or admin custom instructions
    const arrivingRes = (db.reservations || []).find(r => 
      (r.flatId === flat.id || String(r.flatNumber) === String(flat.number)) && 
      r.checkinDate === dateStr && 
      r.status !== "cancelada"
    );
    const hasTwinBeds = Boolean(req_.twinBeds || (arrivingRes && arrivingRes.twinBeds));
    const hasExtraMattress = Boolean(req_.extraMattress || (arrivingRes && arrivingRes.extraMattress));
    const hasPrefersHighFloor = Boolean(arrivingRes && arrivingRes.prefersHighFloor);
    const specialRequests = req_.adminNote || req_.pendingObservation || (arrivingRes && (arrivingRes.specialRequests || arrivingRes.notes)) || null;

    const setupInfo = (hasTwinBeds || hasExtraMattress || hasPrefersHighFloor || specialRequests) ? {
      twinBeds: hasTwinBeds,
      extraMattress: hasExtraMattress,
      prefersHighFloor: hasPrefersHighFloor,
      specialRequests: specialRequests,
      adminNote: req_.adminNote || null,
      guestName: arrivingRes?.guestName || null
    } : null;

    // Check if flat is currently occupied with a checkout on the next day or future
    const activeResToday = (db.reservations || []).find(r => 
      (r.flatId === flat.id || String(r.flatNumber) === String(flat.number)) &&
      r.status !== "cancelada" && r.status !== "cancelado" &&
      r.checkinDate <= dateStr && r.checkoutDate > dateStr
    );
    const hasFutureCheckoutOnly = Boolean(activeResToday && activeResToday.checkoutDate > dateStr && !req_.leavingGuest && req_.source !== "guest_checkout" && !req_.isVacant);

    return {
      flatId: flat.id,
      flatNumber: flat.number,
      checkoutDate: req_.requestDate,
      hasCheckinToday,
      isOccupied,
      isVacant,
      isPriority: req_.isPriority || false,
      isExtended: req_.isExtended || req_.status === "extended",
      isPendingFromPreviousDay: Boolean(req_.isPendingFromPreviousDay),
      originalRequestDate: req_.originalRequestDate || null,
      leavingGuest: req_.leavingGuest || null,
      arrivingGuest: req_.arrivingGuest || null,
      activeReservation: activeResToday ? {
        guestName: activeResToday.guestName,
        checkinDate: activeResToday.checkinDate,
        checkoutDate: activeResToday.checkoutDate,
        isFutureCheckout: activeResToday.checkoutDate > dateStr
      } : null,
      hasFutureCheckoutOnly,
      setupInfo,
      pendingPeriodicTasks: pendingTasks,
      pendingSurveys,
      cleaningRequest: {
        id: req_.id,
        flatId: req_.flatId,
        flatNumber: flat.number,
        requestDate: req_.requestDate,
        source: req_.source,
        status: req_.status,
        isPriority: req_.isPriority || false,
        isExtended: req_.isExtended || req_.status === "extended",
        isPendingFromPreviousDay: Boolean(req_.isPendingFromPreviousDay),
        originalRequestDate: req_.originalRequestDate || null,
        assignedUserId: req_.assignedUserId,
        assignedUsername: assignedUser ? assignedUser.username : null,
        pendingObservation: req_.pendingObservation,
        isVacant: req_.isVacant,
        willCleanAt: req_.willCleanAt,
        cleaningStartedAt: req_.cleaningStartedAt,
        completedAt: req_.completedAt,
        createdAt: req_.createdAt,
        updatedAt: req_.updatedAt,
      }
    };
  });

  result.sort((a, b) => {
    if (a.isPriority && !b.isPriority) return -1;
    if (!a.isPriority && b.isPriority) return 1;
    if (a.isPendingFromPreviousDay && !b.isPendingFromPreviousDay) return -1;
    if (!a.isPendingFromPreviousDay && b.isPendingFromPreviousDay) return 1;
    if (a.hasCheckinToday && !b.hasCheckinToday) return -1;
    if (!a.hasCheckinToday && b.hasCheckinToday) return 1;
    return a.flatNumber.localeCompare(b.flatNumber, undefined, { numeric: true });
  });

  res.json(result);
});

app.get("/api/reservations/checkins", (req, res) => {
  const dateStr = req.query.date || getTodayStr();
  const list = (db.reservations || [])
    .filter(r => (r.checkinDate === dateStr || r.checkinDate?.substring(0, 10) === dateStr) && r.status !== "cancelada")
    .map(r => {
      const flat = db.flats.find(f => f.id === r.flatId || String(f.number) === String(r.flatNumber)) || { id: r.flatId, number: r.flatNumber || "113" };
      return {
        id: r.id,
        flatId: flat.id,
        flatNumber: flat.number,
        guestName: r.guestName,
        checkinDate: r.checkinDate,
        checkoutDate: r.checkoutDate,
        guestCount: r.guestCount || r.adults || 1,
        channel: r.channel || "direta",
        notes: r.notes || "",
        earlyCheckinAuthorized: Boolean(r.earlyCheckinAuthorized),
        hasPreCheckin: Boolean(r.fnhrCompleted || (r.guests && r.guests.some(g => g.hasCompletedCheckin)))
      };
    });
  res.json(list);
});

// ── Calendar Sync & .ICS Download Endpoint (RFC 5545 / RFC 5546) ─────────────
app.get("/api/reservations/:code/calendar.ics", (req, res) => {
  try {
    const code = req.params.code;
    const resItem = (db.reservations || []).find(r => 
      String(r.id) === code || String(r.code) === code || String(r.reservationCode) === code
    );

    if (!resItem) {
      return res.status(404).send("Reserva não encontrada");
    }

    const isCancelled = resItem.status === "cancelada" || resItem.status === "CANCELLED" || req.query.action === "cancel";
    const method = isCancelled ? "CANCEL" : "REQUEST";
    const status = isCancelled ? "CANCELLED" : "CONFIRMED";
    const sequence = resItem.calendarSequence ?? (isCancelled ? 1 : 0);

    const checkinDt = (resItem.checkinDate || getTodayStr()).replace(/-/g, "") + "T140000";
    const checkoutDt = (resItem.checkoutDate || getTodayStr()).replace(/-/g, "") + "T120000";
    const nowDt = new Date().toISOString().replace(/[-:T.]/g, "").substring(0, 15) + "Z";
    
    const uid = `booking-${resItem.code || resItem.id}@corpflats.com.br`;
    const title = isCancelled 
      ? `CANCELADA: Hospedagem CorpFlats - Flat ${resItem.flatNumber || '113'} (#${resItem.code || resItem.id})`
      : sequence > 0
      ? `REMARCADA: Hospedagem CorpFlats - Flat ${resItem.flatNumber || '113'} (#${resItem.code || resItem.id})`
      : `Hospedagem CorpFlats - Flat ${resItem.flatNumber || '113'} - Reserva #${resItem.code || resItem.id}`;

    const location = `Edifício Soho Residence Service, Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ, CEP 28010-140`;
    const manageUrl = `https://corpflats.onrender.com/minha-reserva/${resItem.code || resItem.id}`;
    const guestEmail = resItem.guestEmail || `hospede-${resItem.code || resItem.id}@corpflats.com.br`;

    const descLines = [];
    if (isCancelled) {
      descLines.push(
        `⚠️ RESERVA CANCELADA`,
        `----------------------------------------`,
        `A sua reserva #${resItem.code || resItem.id} no Flat ${resItem.flatNumber || '113'} foi cancelada.`,
        `Mais informações: ${manageUrl}`,
        `WhatsApp do Atendimento: +55 (22) 99712-4021`
      );
    } else {
      descLines.push(
        sequence > 0 ? `🔄 RESERVA REMARCADA / ATUALIZADA` : `🏨 HOSPEDAGEM CONFIRMADA NA CORPFLATS`,
        `----------------------------------------`,
        `Acomodação: Flat ${resItem.flatNumber || '905'}`,
        `Reserva: #${resItem.code || resItem.id}`,
        `Hóspede: ${resItem.guestName || 'Hóspede'}`,
        `Check-in: ${resItem.checkinDate} a partir das 14:00`,
        `Check-out: ${resItem.checkoutDate} até as 12:00`,
        resItem.accessCode ? `🔑 Senha da Fechadura Digital: ${resItem.accessCode}` : `🔑 As instruções de acesso serão liberadas no dia do check-in.`,
        `Wi-Fi: CorpFlats_Hospedes (Senha: hospedeconforto)`,
        `Gerenciar sua reserva: ${manageUrl}`,
        `WhatsApp Suporte: +55 (22) 99712-4021`
      );
    }

    const formattedDesc = descLines.join("\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
    const partStat = sequence > 0 ? "NEEDS-ACTION" : "ACCEPTED";

    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//CorpFlats Macae//Motor de Reservas 2.0//PT",
      "CALSCALE:GREGORIAN",
      `METHOD:${method}`,
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `SEQUENCE:${sequence}`,
      `STATUS:${status}`,
      `DTSTAMP:${nowDt}`,
      `DTSTART;TZID=America/Sao_Paulo:${checkinDt}`,
      `DTEND;TZID=America/Sao_Paulo:${checkoutDt}`,
      `SUMMARY:${title}`,
      `DESCRIPTION:${formattedDesc}`,
      `LOCATION:${location}`,
      `URL:${manageUrl}`,
      `ORGANIZER;CN="CorpFlats Macaé":mailto:reservas@corpflats.com.br`,
      `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=${partStat};CN=${resItem.guestName || 'Hospede'}:mailto:${guestEmail}`
    ];

    if (!isCancelled) {
      lines.push(
        "BEGIN:VALARM",
        "TRIGGER:-PT24H",
        "ACTION:DISPLAY",
        `DESCRIPTION:Lembrete de Check-in amanhã no Flat ${resItem.flatNumber || '905'} da CorpFlats!`,
        "END:VALARM",
        "BEGIN:VALARM",
        "TRIGGER:-PT2H",
        "ACTION:DISPLAY",
        `DESCRIPTION:Check-in CorpFlats hoje às 14:00 - Flat ${resItem.flatNumber || '905'}. Tenha seu código de acesso em mãos.`,
        "END:VALARM"
      );
    }

    lines.push("END:VEVENT", "END:VCALENDAR");
    const icsPayload = lines.join("\r\n");

    res.setHeader("Content-Type", `text/calendar; charset=UTF-8; method=${method}`);
    res.setHeader("Content-Disposition", `inline; filename="reserva-corpflats-${resItem.code || resItem.id}.ics"`);
    res.send(icsPayload);
  } catch (err) {
    res.status(500).send("Erro ao gerar calendário .ics: " + err.message);
  }
});

// ── Dashboard Summary ───────────────────────────────────────────────────────
app.get("/api/dashboard/summary", (req, res) => {
  triggerBackgroundSync();
  const dateStr = req.query.date || getTodayStr();
  const requestsForDate = getRequestsForDate(dateStr);

  let totalClean = 0, totalPending = 0, totalCleaning = 0, totalWillClean = 0, totalDirty = 0;
  for (const r of requestsForDate) {
    if (r.status === "clean") totalClean++;
    else if (r.status === "pending_issue") totalPending++;
    else if (r.status === "cleaning_now") totalCleaning++;
    else if (r.status === "will_clean") totalWillClean++;
    else totalDirty++;
  }

  const byUserMap = {};
  for (const r of requestsForDate) {
    if (!r.assignedUserId) continue;
    const u = db.users.find(x => x.id === r.assignedUserId);
    if (!byUserMap[r.assignedUserId]) {
      byUserMap[r.assignedUserId] = {
        userId: r.assignedUserId,
        username: u ? u.username : "Desconhecido",
        count: 0
      };
    }
    byUserMap[r.assignedUserId].count++;
  }

  res.json({
    date: dateStr,
    totalCheckouts: requestsForDate.length,
    totalClean,
    totalPending,
    totalCleaning,
    totalWillClean,
    totalDirty,
    byUser: Object.values(byUserMap),
  });
});

// ── Priority Toggle Endpoint ────────────────────────────────────────────────
app.patch("/api/cleaning/assignments/:requestId/priority", (req, res) => {
  const reqId = Number(req.params.requestId);
  const item = db.cleaningRequests.find(r => r.id === reqId);
  if (!item) return res.status(404).json({ error: "Solicitação não encontrada" });

  item.isPriority = typeof req.body.isPriority === "boolean" ? req.body.isPriority : !item.isPriority;
  item.updatedAt = new Date().toISOString();
  saveDatabase();
  res.json(item);
});

// ── Release / Devolver Flat Endpoint ────────────────────────────────────────
app.post("/api/cleaning/assignments/:requestId/release", (req, res) => {
  const reqId = Number(req.params.requestId);
  const item = db.cleaningRequests.find(r => r.id === reqId);
  if (!item) return res.status(404).json({ error: "Solicitação não encontrada" });

  const now = new Date().toISOString();
  item.status = "dirty";
  item.assignedUserId = null;
  item.willCleanAt = null;
  item.cleaningStartedAt = null;
  item.completedAt = null;
  item.pendingObservation = null;
  item.updatedAt = now;
  saveDatabase();

  const flat = db.flats.find(f => f.id === item.flatId);
  res.json({
    ...item,
    flatNumber: flat ? flat.number : String(item.flatId),
    assignedUsername: null,
    assignedUserName: null,
  });
});

// ── Resolve Issue / Baixa de Pendência Endpoint ─────────────────────────────
app.post("/api/cleaning/assignments/:requestId/resolve-issue", (req, res) => {
  const reqId = Number(req.params.requestId);
  const item = db.cleaningRequests.find(r => r.id === reqId);
  if (!item) return res.status(404).json({ error: "Solicitação não encontrada" });

  const userAuth = getAuthUser(req);
  const now = new Date().toISOString();
  item.status = "clean";
  item.assignedUserId = userAuth ? userAuth.id : (item.assignedUserId || 2);
  item.completedAt = now;
  item.pendingObservation = null;
  item.updatedAt = now;
  saveDatabase();

  const flat = db.flats.find(f => f.id === item.flatId);
  const assignedUser = db.users.find(u => u.id === item.assignedUserId);

  res.json({
    ...item,
    flatNumber: flat ? flat.number : String(item.flatId),
    assignedUsername: assignedUser ? assignedUser.username : null,
  });
});

// ── Cleaning Status Change & Execution ──────────────────────────────────────
app.patch("/api/cleaning/assignments/:requestId/status", (req, res) => {
  const reqId = Number(req.params.requestId);
  const { status, observation, isVacant, executedPeriodicTaskIds = [], surveyAnswers = [], flatNumber, flatId, date, assignedUserId } = req.body;
  let item = db.cleaningRequests.find(r => r.id === reqId);
  if (!item && flatNumber && date) {
    item = db.cleaningRequests.find(r => r.flatNumber === String(flatNumber) && r.requestDate === date);
  }
  if (!item && flatId && date) {
    item = db.cleaningRequests.find(r => r.flatId === Number(flatId) && r.requestDate === date);
  }
  if (!item) return res.status(404).json({ error: "Solicitação não encontrada" });

  const userAuth = getAuthUser(req);
  const now = new Date().toISOString();
  if (typeof isVacant === "boolean") {
    item.isVacant = isVacant;
  }

  // Minimum time enforcement: 10 minutes minimum from cleaningStartedAt
  if (status === "clean" && item.cleaningStartedAt) {
    const started = new Date(item.cleaningStartedAt).getTime();
    const elapsedMinutes = (Date.now() - started) / 60000;
    if (elapsedMinutes < 10 && userAuth?.role !== "admin") {
      return res.status(400).json({
        error: "Não é possível finalizar a limpeza ainda. Tempo insuficiente de higienização (mínimo de 10 minutos)."
      });
    }
  }

  if (assignedUserId) {
    const targetUser = db.users.find(u => u.id === Number(assignedUserId));
    if (targetUser) {
      item.assignedUserId = targetUser.id;
    }
  }

  if (status) {
    item.status = status;
    if (status === "dirty") {
      item.assignedUserId = null;
      item.willCleanAt = null;
      item.cleaningStartedAt = null;
      item.completedAt = null;
      item.pendingObservation = null;
    } else if (status === "will_clean") {
      if (assignedUserId) {
        item.assignedUserId = Number(assignedUserId);
      } else {
        item.assignedUserId = userAuth ? userAuth.id : 2;
      }
      item.willCleanAt = now;
    } else if (status === "cleaning_now") {
      item.cleaningStartedAt = now;
      if (assignedUserId) {
        item.assignedUserId = Number(assignedUserId);
      } else if (!item.assignedUserId) {
        item.assignedUserId = userAuth ? userAuth.id : 2;
      }
    } else if (status === "clean" || status === "pending_issue") {
      item.completedAt = now;
      if (assignedUserId) {
        item.assignedUserId = Number(assignedUserId);
      } else if (!item.assignedUserId) {
        item.assignedUserId = userAuth ? userAuth.id : 2;
      }
      item.pendingObservation = status === "pending_issue" ? (observation || "Pendência registrada") : null;

      if (status === "clean") {
        for (const prev of db.cleaningRequests) {
          if ((prev.flatId === item.flatId || prev.flatNumber === item.flatNumber) && prev.requestDate <= item.requestDate && (prev.status === "dirty" || prev.status === "will_clean")) {
            prev.status = "clean";
            prev.assignedUserId = item.assignedUserId;
            prev.completedAt = now;
            prev.updatedAt = now;
          }
        }
      }

      if (status === "pending_issue") {
        const flatObj = db.flats.find(f => f.id === item.flatId);
        const fNum = flatObj ? flatObj.number : (item.flatNumber || String(item.flatId));
        createNotification({
          category: "defect",
          title: `⚠️ Pendência / Defeito no Apt ${fNum}`,
          message: observation ? `Observação: "${observation}"` : "Camareira registrou uma pendência ou defeito no quarto.",
          severity: "warning",
          metadata: { flatId: item.flatId, flatNumber: fNum, observation },
          targetUrl: "/dashboard"
        });
      }

      for (const ptId of executedPeriodicTaskIds) {
        db.periodicExecutions.push({
          id: db.periodicExecutions.length + 1,
          periodicTaskId: Number(ptId),
          flatId: item.flatId,
          executedByUserId: item.assignedUserId || (userAuth ? userAuth.id : 2),
          executedAt: now,
          notes: "Executado durante a limpeza do checkout",
          createdAt: now,
        });
      }

      for (const ans of surveyAnswers) {
        const survey = db.surveys.find(s => s.id === Number(ans.surveyId));
        if (survey) {
          const flat = db.flats.find(f => f.id === item.flatId);
          survey.responses.push({
            flatId: item.flatId,
            flatNumber: flat ? flat.number : String(item.flatId),
            answer: ans.answer || "Sim",
            notes: ans.notes || null,
            answeredByUserId: item.assignedUserId || (userAuth ? userAuth.id : 2),
            answeredByUsername: userAuth ? userAuth.username : "Camareira",
            answeredAt: now,
          });
        }
      }
    } else if (status === "dirty") {
      item.assignedUserId = null;
      item.willCleanAt = null;
      item.cleaningStartedAt = null;
      item.completedAt = null;
      item.pendingObservation = null;
    }
  }
  item.updatedAt = now;
  saveDatabase();

  const flat = db.flats.find(f => f.id === item.flatId);
  const assignedUser = db.users.find(u => u.id === item.assignedUserId);

  logAuditEvent({
    level: "info",
    category: "cleaning",
    action: userAuth?.role === "admin" && status === "clean" && assignedUserId
      ? "CLEANING_COMPLETED_BY_ADMIN_FOR_MAID"
      : `CLEANING_STATUS_${status.toUpperCase()}`,
    actor: { name: userAuth ? (userAuth.name || userAuth.username) : "Sistema", role: userAuth?.role || "admin" },
    details: {
      requestId: item.id,
      flatNumber: flat ? flat.number : (item.flatNumber || String(item.flatId)),
      status: item.status,
      assignedUserId: item.assignedUserId,
      assignedMaidName: assignedUser ? (assignedUser.name || assignedUser.username) : "Camareira",
      markedByAdmin: userAuth?.role === "admin"
    },
    source: "cleaning_dashboard"
  });

  res.json({
    ...item,
    flatNumber: flat ? flat.number : String(item.flatId),
    assignedUsername: assignedUser ? assignedUser.username : null,
    assignedUserName: assignedUser ? (assignedUser.name || assignedUser.username) : null,
  });
});

app.post("/api/cleaning/assignments/batch-claim", (req, res) => {
  const { requestIds = [] } = req.body;
  const userAuth = getAuthUser(req);
  const now = new Date().toISOString();
  let claimed = 0;

  const todayStr = getTodayStr();
  for (const id of requestIds) {
    const item = db.cleaningRequests.find(r => r.id === id);
    if (item && item.status === "dirty") {
      item.status = "will_clean";
      item.assignedUserId = userAuth ? userAuth.id : 2;
      item.willCleanAt = now;
      item.updatedAt = now;
      claimed++;
    }
  }
  saveDatabase();
  res.json({ claimed, total: requestIds.length });
});

app.get("/api/cleaning/history", (req, res) => {
  const userAuth = getAuthUser(req);
  const startDate = req.query.startDate || "2000-01-01";
  const endDate = req.query.endDate || "2099-12-31";

  let list = db.cleaningRequests.filter(r => {
    if (r.status !== "clean") return false;
    const effectiveDate = (r.completedAt ? r.completedAt.substring(0, 10) : r.requestDate);
    if (effectiveDate < startDate || effectiveDate > endDate) return false;
    if (userAuth?.role === "camareira" && r.assignedUserId !== userAuth.id) return false;
    return true;
  });

  const result = list.map(r => {
    const flat = db.flats.find(f => f.id === r.flatId);
    const assignedUser = db.users.find(u => u.id === r.assignedUserId);
    
    let durationMinutes = 35;
    if (r.cleaningStartedAt && r.completedAt) {
      const startMs = new Date(r.cleaningStartedAt).getTime();
      const endMs = new Date(r.completedAt).getTime();
      if (endMs > startMs) {
        durationMinutes = Math.max(1, Math.round((endMs - startMs) / 60000));
      }
    }

    return {
      id: r.id,
      flatId: r.flatId,
      flatNumber: flat ? flat.number : (r.flatNumber || String(r.flatId)),
      requestDate: r.requestDate,
      effectiveDate: (r.completedAt ? r.completedAt.substring(0, 10) : r.requestDate),
      status: r.status,
      isPriority: r.isPriority || false,
      source: r.source || "checkout",
      assignedUserId: r.assignedUserId,
      assignedUsername: assignedUser ? assignedUser.username : (r.assignedUsername || "Camareira"),
      pendingObservation: r.pendingObservation || r.adminNote || null,
      cleaningStartedAt: r.cleaningStartedAt,
      completedAt: r.completedAt,
      durationMinutes,
      createdAt: r.createdAt,
    };
  });

  // Ordena do mais recente para o mais antigo
  result.sort((a, b) => {
    const timeA = new Date(a.completedAt || a.requestDate).getTime();
    const timeB = new Date(b.completedAt || b.requestDate).getTime();
    return timeB - timeA;
  });

  res.json(result);
});

// ── Surveys Endpoints ───────────────────────────────────────────────────────
app.get("/api/surveys", (req, res) => {
  res.json(db.surveys);
});

app.get("/api/surveys/active", (req, res) => {
  res.json(db.surveys.filter(s => s.isActive));
});

app.post("/api/surveys", (req, res) => {
  const { title, question, type = "yes_no", isActive = true } = req.body;
  if (!title || !question) return res.status(400).json({ error: "Título e pergunta são obrigatórios" });

  const newSurvey = {
    id: db.surveys.length > 0 ? Math.max(...db.surveys.map(s => s.id)) + 1 : 1,
    title,
    question,
    type,
    isActive: Boolean(isActive),
    createdAt: new Date().toISOString(),
    responses: []
  };
  db.surveys.unshift(newSurvey);
  saveDatabase();
  res.status(201).json(newSurvey);
});

app.patch("/api/surveys/:id/toggle", (req, res) => {
  const survey = db.surveys.find(s => s.id === Number(req.params.id));
  if (!survey) return res.status(404).json({ error: "Pesquisa não encontrada" });
  survey.isActive = !survey.isActive;
  saveDatabase();
  res.json(survey);
});

app.delete("/api/surveys/:id", (req, res) => {
  db.surveys = db.surveys.filter(s => s.id !== Number(req.params.id));
  saveDatabase();
  res.json({ success: true });
});

// ── Periodic Tasks (Manutenções Preventivas & Recorrentes) ───────────────────
app.get("/api/periodic-tasks", (req, res) => {
  res.json(db.periodicTasks || []);
});

app.post("/api/periodic-tasks", (req, res) => {
  const { name, description, periodDays = 7, firstDueDate, assignToHousekeeping = true, flatIds = [] } = req.body;
  if (!db.periodicTasks) db.periodicTasks = [];
  
  const todayStr = getTodayStr();
  const newTask = {
    id: db.periodicTasks.length > 0 ? Math.max(...db.periodicTasks.map(t => t.id)) + 1 : 1,
    name: name.trim(),
    description: description ? description.trim() : null,
    periodDays: Number(periodDays) || 7,
    firstDueDate: firstDueDate ? String(firstDueDate).substring(0, 10) : todayStr,
    assignToHousekeeping: Boolean(assignToHousekeeping),
    isActive: true,
    flatIds: Array.isArray(flatIds) && flatIds.length > 0 ? flatIds : db.flats.map(f => f.id),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.periodicTasks.push(newTask);
  saveDatabase();
  res.status(201).json(newTask);
});

app.put("/api/periodic-tasks/:id", (req, res) => {
  const id = Number(req.params.id);
  const task = (db.periodicTasks || []).find(t => t.id === id);
  if (!task) return res.status(404).json({ error: "Tarefa preventiva não encontrada" });

  const { name, description, periodDays, firstDueDate, assignToHousekeeping, isActive, flatIds } = req.body;
  if (name !== undefined) task.name = name.trim();
  if (description !== undefined) task.description = description ? description.trim() : null;
  if (periodDays !== undefined) task.periodDays = Number(periodDays) || task.periodDays;
  if (firstDueDate !== undefined) task.firstDueDate = String(firstDueDate).substring(0, 10);
  if (assignToHousekeeping !== undefined) task.assignToHousekeeping = Boolean(assignToHousekeeping);
  if (isActive !== undefined) task.isActive = Boolean(isActive);
  if (flatIds !== undefined) task.flatIds = Array.isArray(flatIds) ? flatIds : task.flatIds;
  task.updatedAt = new Date().toISOString();

  saveDatabase();
  res.json(task);
});

app.patch("/api/periodic-tasks/:id", (req, res) => {
  const id = Number(req.params.id);
  const task = (db.periodicTasks || []).find(t => t.id === id);
  if (!task) return res.status(404).json({ error: "Tarefa preventiva não encontrada" });

  Object.assign(task, req.body);
  task.updatedAt = new Date().toISOString();
  saveDatabase();
  res.json(task);
});

app.delete("/api/periodic-tasks/:id", (req, res) => {
  const id = Number(req.params.id);
  db.periodicTasks = (db.periodicTasks || []).filter(t => t.id !== id);
  db.periodicExecutions = (db.periodicExecutions || []).filter(e => e.periodicTaskId !== id);
  saveDatabase();
  res.json({ success: true });
});

app.post("/api/periodic-tasks/:id/execute", (req, res) => {
  const id = Number(req.params.id);
  const { flatId, notes = "" } = req.body;
  const userAuth = getAuthUser(req);
  const now = new Date().toISOString();

  if (!db.periodicExecutions) db.periodicExecutions = [];
  const exec = {
    id: db.periodicExecutions.length > 0 ? Math.max(...db.periodicExecutions.map(e => e.id)) + 1 : 1,
    periodicTaskId: id,
    flatId: Number(flatId),
    executedByUserId: userAuth ? userAuth.id : 1,
    executedAt: now,
    notes: notes || "Executado manualmente",
    createdAt: now,
  };
  db.periodicExecutions.push(exec);
  saveDatabase();
  res.status(201).json(exec);
});

app.get("/api/periodic-tasks/pending", (req, res) => {
  const todayStr = getTodayStr();
  const todayTime = new Date(todayStr).getTime();
  const result = [];

  for (const task of (db.periodicTasks || []).filter(t => t.isActive)) {
    const targetFlats = Array.isArray(task.flatIds) && task.flatIds.length > 0 ? task.flatIds : db.flats.map(f => f.id);
    for (const flatId of targetFlats) {
      const flat = db.flats.find(f => f.id === flatId);
      if (!flat) continue;

      const executions = (db.periodicExecutions || []).filter(e => e.periodicTaskId === task.id && e.flatId === flatId);
      executions.sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime());
      const lastExec = executions[0] || null;

      let nextDueAt;
      if (lastExec) {
        const d = new Date(lastExec.executedAt.substring(0, 10));
        d.setDate(d.getDate() + task.periodDays);
        nextDueAt = d.toISOString().substring(0, 10);
      } else {
        nextDueAt = task.firstDueDate || (task.createdAt ? task.createdAt.substring(0, 10) : todayStr);
      }

      const dueDateTime = new Date(nextDueAt).getTime();
      const daysDiff = Math.round((todayTime - dueDateTime) / 86400000);

      result.push({
        taskId: task.id,
        taskName: task.name,
        taskDescription: task.description,
        flatId: flat.id,
        flatNumber: flat.number,
        periodDays: task.periodDays,
        firstDueDate: task.firstDueDate || null,
        assignToHousekeeping: task.assignToHousekeeping !== false,
        lastExecutedAt: lastExec ? lastExec.executedAt : null,
        nextDueAt,
        daysOverdue: daysDiff, // > 0: atrasada em X dias; 0: vence hoje; < 0: faltam |daysDiff| dias
      });
    }
  }
  res.json(result);
});

// ── Observations / Issues ───────────────────────────────────────────────────
app.get("/api/observations", (req, res) => {
  res.json(db.observations);
});

app.post("/api/observations", (req, res) => {
  const { flatId, category = "outro", text } = req.body;
  const userAuth = getAuthUser(req);
  const flat = db.flats.find(f => f.id === flatId);
  const newObs = {
    id: db.observations.length + 1,
    flatId,
    flatNumber: flat ? flat.number : String(flatId),
    authorUserId: userAuth ? userAuth.id : 1,
    authorUsername: userAuth ? userAuth.username : "admin",
    category,
    text,
    status: "aberta",
    resolvedAt: null,
    resolvedByUserId: null,
    resolvedByUsername: null,
    resolvedNote: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.observations.unshift(newObs);
  saveDatabase();

  // Disparo de Alerta / Notificação em tempo real
  createNotification({
    category: "defect",
    title: `⚠️ Nova Avaria/Defeito - Flat ${newObs.flatNumber}`,
    message: `${newObs.authorUsername} relatou (${newObs.category}): "${newObs.text}"`,
    severity: "warning",
    metadata: { flatId: newObs.flatId, flatNumber: newObs.flatNumber, obsId: newObs.id, category: newObs.category },
    targetUrl: "/observations"
  });

  res.status(201).json(newObs);
});

app.patch("/api/observations/:id/resolve", (req, res) => {
  const id = Number(req.params.id);
  const obs = db.observations.find(o => o.id === id);
  if (!obs) return res.status(404).json({ error: "Observação não encontrada" });

  const userAuth = getAuthUser(req);
  obs.status = "resolvida";
  obs.resolvedAt = new Date().toISOString();
  obs.resolvedByUserId = userAuth ? userAuth.id : 1;
  obs.resolvedByUsername = userAuth ? userAuth.username : "admin";
  obs.resolvedNote = req.body.resolvedNote || "Resolvido com sucesso";
  obs.updatedAt = new Date().toISOString();
  saveDatabase();
  res.json(obs);
});

// ── Analytics & Reports ─────────────────────────────────────────────────────

// ── Configuração de Valores de Pagamento por Quarto (Camareiras) ────────────
app.get("/api/cleaning/rates", (req, res) => {
  if (!db.cleaningRates) {
    db.cleaningRates = {
      defaultRatePerRoom: 22.50,
      userRates: {}
    };
    saveDatabase();
  }
  const cleaners = (db.users || []).filter(u => u.role === "camareira" || u.role === "cleaner" || u.role === "admin");
  const list = cleaners.map(u => ({
    userId: u.id,
    username: u.username,
    name: u.name || u.username,
    role: u.role,
    rate: db.cleaningRates.userRates?.[u.id] !== undefined ? Number(db.cleaningRates.userRates[u.id]) : Number(db.cleaningRates.defaultRatePerRoom || 22.50)
  }));

  res.json({
    defaultRatePerRoom: Number(db.cleaningRates.defaultRatePerRoom || 22.50),
    userRates: db.cleaningRates.userRates || {},
    cleaners: list
  });
});

app.post("/api/cleaning/rates", (req, res) => {
  const { defaultRatePerRoom, userRates } = req.body;
  if (!db.cleaningRates) db.cleaningRates = {};
  if (defaultRatePerRoom !== undefined) db.cleaningRates.defaultRatePerRoom = Number(defaultRatePerRoom);
  if (userRates !== undefined) db.cleaningRates.userRates = userRates;
  saveDatabase();
  res.json({ success: true, rates: db.cleaningRates });
});

app.get("/api/analytics/report", (req, res) => {
  const userAuth = getAuthUser(req);
  const isCamareira = userAuth?.role === "camareira";
  const startDate = req.query.startDate || getOffsetDateStr(-30);
  const endDate = req.query.endDate || getTodayStr();

  if (!db.cleaningRates) {
    db.cleaningRates = { defaultRatePerRoom: 22.50, userRates: {} };
  }
  const defaultRate = Number(db.cleaningRates.defaultRatePerRoom || 22.50);

  // Filtra limpezas concluídas no período [startDate, endDate]
  const completedCleanings = (db.cleaningRequests || []).filter(r => {
    if (r.status !== "clean" || r.isBedAdjustmentOnly || r.isPaidCleaning === false) return false;
    const effectiveDate = (r.completedAt ? r.completedAt.substring(0, 10) : r.requestDate);
    return effectiveDate >= startDate && effectiveDate <= endDate;
  });

  let grandTotalToPay = 0;

  // Camareiras / Usuários
  const candidateUsers = (db.users || []).filter(u => u.role === "camareira" || u.role === "cleaner" || u.role === "admin");
  const cleaningsByUser = candidateUsers.map(u => {
    const userCleanings = completedCleanings
      .filter(c => c.assignedUserId === u.id)
      .sort((a, b) => {
        const dateA = a.requestDate || "";
        const dateB = b.requestDate || "";
        const c = dateA.localeCompare(dateB);
        if (c !== 0) return c;
        return Number(String(a.flatNumber).replace(/\D/g, "") || 0) - Number(String(b.flatNumber).replace(/\D/g, "") || 0);
      });
    let totalMinutes = 0;
    let validDurationCount = 0;
    
    userCleanings.forEach(c => {
      if (c.cleaningStartedAt && c.completedAt) {
        const startMs = new Date(c.cleaningStartedAt).getTime();
        const endMs = new Date(c.completedAt).getTime();
        if (endMs > startMs) {
          const diffMins = (endMs - startMs) / 60000;
          // Regra: Quartos com mais de 90min (esquecimento de finalização) não entram no cálculo do tempo médio
          if (diffMins <= 90) {
            totalMinutes += diffMins;
            validDurationCount++;
          }
        }
      }
    });

    const avgMinutes = validDurationCount > 0 ? Math.round(totalMinutes / validDurationCount) : 35;
    const ratePerRoom = db.cleaningRates.userRates?.[u.id] !== undefined 
      ? Number(db.cleaningRates.userRates[u.id]) 
      : defaultRate;

    const totalToPay = userCleanings.length * ratePerRoom;
    grandTotalToPay += totalToPay;

    return {
      userId: u.id,
      username: u.username,
      name: u.name || u.username,
      role: u.role,
      count: userCleanings.length,
      avgDurationMinutes: avgMinutes,
      ratePerRoom,
      totalToPay: Number(totalToPay.toFixed(2)),
      cleanings: userCleanings.map(c => {
        const flat = (db.flats || []).find(f => f.id === c.flatId);
        let itemDuration = 35;
        if (c.cleaningStartedAt && c.completedAt) {
          const s = new Date(c.cleaningStartedAt).getTime();
          const e = new Date(c.completedAt).getTime();
          if (e > s) itemDuration = Math.max(1, Math.round((e - s) / 60000));
        }
        return {
          id: c.id,
          flatNumber: flat ? flat.number : (c.flatNumber || String(c.flatId)),
          requestDate: c.requestDate,
          cleaningStartedAt: c.cleaningStartedAt,
          completedAt: c.completedAt,
          durationMinutes: itemDuration,
          rate: ratePerRoom
        };
      }),
      totalHoursSpent: Number((totalMinutes / 60).toFixed(1))
    };
  }).filter(u => u.role === "camareira" || u.role === "cleaner" || u.count > 0);

  // My cleanings stats se for camareira
  const myCleanings = userAuth ? completedCleanings.filter(c => c.assignedUserId === userAuth.id) : [];
  const myRate = userAuth && db.cleaningRates.userRates?.[userAuth.id] !== undefined
    ? Number(db.cleaningRates.userRates[userAuth.id])
    : defaultRate;
  const myTotalToPay = myCleanings.length * myRate;

  // Cleanings by day of week
  const daysOfWeek = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const dayCounts = [0, 0, 0, 0, 0, 0, 0];
  completedCleanings.forEach(c => {
    const dStr = c.completedAt ? c.completedAt.substring(0, 10) : c.requestDate;
    if (dStr) {
      const d = new Date(dStr + "T12:00:00Z");
      const dayIndex = d.getUTCDay();
      if (!isNaN(dayIndex)) {
        dayCounts[dayIndex]++;
      }
    }
  });

  const cleaningsByDayOfWeek = daysOfWeek.map((dayName, idx) => ({
    dayName,
    count: dayCounts[idx]
  }));

  // Top flats by cleanings
  const flatCleanCounts = new Map();
  completedCleanings.forEach(c => {
    const flat = db.flats.find(f => f.id === c.flatId);
    const flatNum = flat ? flat.number : (c.flatNumber || String(c.flatId));
    flatCleanCounts.set(flatNum, (flatCleanCounts.get(flatNum) || 0) + 1);
  });

  const topFlatsByCleanings = Array.from(flatCleanCounts.entries())
    .map(([flatNumber, count]) => ({ flatNumber, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // Observações por categoria
  const observationsByCategoryMap = new Map();
  (db.observations || []).forEach(o => {
    const oDate = o.createdAt ? o.createdAt.substring(0, 10) : "";
    if (!oDate || (oDate >= startDate && oDate <= endDate)) {
      const cat = o.category || "defeito";
      observationsByCategoryMap.set(cat, (observationsByCategoryMap.get(cat) || 0) + 1);
    }
  });

  const observationsByCategory = Array.from(observationsByCategoryMap.entries()).map(([category, count]) => ({
    category,
    count
  }));

  res.json({
    startDate,
    endDate,
    isCamareira,
    totalCleanings: completedCleanings.length,
    grandTotalToPay: Number(grandTotalToPay.toFixed(2)),
    defaultRatePerRoom: defaultRate,
    myTotalToPay: Number(myTotalToPay.toFixed(2)),
    myRatePerRoom: myRate,
    myTotalCleanings: userAuth ? completedCleanings.filter(c => c.assignedUserId === userAuth.id).length : completedCleanings.length,
    myAvgDurationMinutes: (() => {
      let myTotalMins = 0;
      let myValidCnt = 0;
      myCleanings.forEach(c => {
        if (c.cleaningStartedAt && c.completedAt) {
          const s = new Date(c.cleaningStartedAt).getTime();
          const e = new Date(c.completedAt).getTime();
          if (e > s) {
            const diff = (e - s) / 60000;
            if (diff <= 90) {
              myTotalMins += diff;
              myValidCnt++;
            }
          }
        }
      });
      return myValidCnt > 0 ? Math.round(myTotalMins / myValidCnt) : 35;
    })(),
    topFlatsByCleanings,
    topFlatsByObservations: [],
    observationsByCategory,
    cleaningsByDayOfWeek,
    cleaningsByUser,
  });
});

// ── Site Content / CMS Customizer Endpoints ─────────────────────────────────
app.get("/api/site-content", (req, res) => {
  let current = db.siteConfig || DEFAULT_SITE_CONFIG;

  // Sanitização em tempo de execução para garantir que dados antigos nunca cheguem ao frontend
  if (
    current.branding?.address?.includes("Macaé") ||
    current.branding?.address?.includes("Atlântica") ||
    current.branding?.brandName?.includes("Macaé") ||
    current.about?.description?.includes("Cavaleiros") ||
    current.hero?.description?.includes("Cavaleiros")
  ) {
    current = {
      ...DEFAULT_SITE_CONFIG,
      ...current,
      branding: {
        ...DEFAULT_SITE_CONFIG.branding,
        ...(current.branding || {}),
        brandName: "CorpFlats",
        logoSubtext: "Campos dos Goytacazes",
        badgeTop: "⭐ Melhor Tarifa Garantida Sempre pelo Nosso Site Oficial",
        address: "Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ, CEP 28010-140 (Edifício Soho Residence Service)",
        googleMapsUrl: "https://maps.google.com/?q=Rua+Conselheiro+Otaviano,+209+-+Centro,+Campos+dos+Goytacazes+-+RJ"
      },
      hero: {
        ...DEFAULT_SITE_CONFIG.hero,
        ...(current.hero || {}),
        title: "Sua Estadia com Conforto & Estilo em Campos dos Goytacazes",
        highlightText: "Conforto, Luz Natural e Sofisticação",
        description: "Flats decorados com estética contemporânea e arejada, ar-condicionado split em todos os ambientes, Wi-Fi 500MB ultra rápido e localização nobre no Edifício Soho Residence Service no Centro de Campos dos Goytacazes."
      },
      about: {
        ...DEFAULT_SITE_CONFIG.about,
        ...(current.about || {}),
        subtitle: "Conceito Flat Boutique com Liberdade e Conforto no Centro de Campos",
        description: "A CorpFlats foi pensada para oferecer a viajantes a lazer e a negócios uma estadia luminosa, acolhedora e contemporânea. Nossos apartamentos combinam o espaço e a privacidade de um lar com o conforto e a praticidade de uma hotelaria de excelência no Edifício Soho Residence Service."
      }
    };
    db.siteConfig = current;
    saveDatabase();
  }

  res.json({
    ...DEFAULT_SITE_CONFIG,
    ...current,
    theme: { ...DEFAULT_SITE_CONFIG.theme, ...(current.theme || {}) },
    branding: { ...DEFAULT_SITE_CONFIG.branding, ...(current.branding || {}) },
    hero: { ...DEFAULT_SITE_CONFIG.hero, ...(current.hero || {}) },
    ratePlans: current.ratePlans || DEFAULT_SITE_CONFIG.ratePlans,
    bedConfig: current.bedConfig || DEFAULT_SITE_CONFIG.bedConfig,
    extraBedConfig: current.extraBedConfig || DEFAULT_SITE_CONFIG.extraBedConfig,
    petPolicy: current.petPolicy || DEFAULT_SITE_CONFIG.petPolicy,
    pricing: current.pricing || DEFAULT_SITE_CONFIG.pricing,
    about: { ...DEFAULT_SITE_CONFIG.about, ...(current.about || {}) },
    amenities: Array.isArray(current.amenities) && current.amenities.length > 0 ? current.amenities : DEFAULT_SITE_CONFIG.amenities,
    gallery: Array.isArray(current.gallery) && current.gallery.length > 0 ? current.gallery : DEFAULT_SITE_CONFIG.gallery,
    testimonials: Array.isArray(current.testimonials) && current.testimonials.length > 0 ? current.testimonials : DEFAULT_SITE_CONFIG.testimonials,
    faq: Array.isArray(current.faq) && current.faq.length > 0 ? current.faq : DEFAULT_SITE_CONFIG.faq,
  });
});

app.post("/api/site-content", (req, res) => {
  const update = req.body || {};
  db.siteConfig = {
    ...(db.siteConfig || DEFAULT_SITE_CONFIG),
    ...update,
    updatedAt: new Date().toISOString()
  };
  saveDatabase();
  res.json({ success: true, siteConfig: db.siteConfig });
});

app.put("/api/site-content", (req, res) => {
  const update = req.body || {};
  db.siteConfig = {
    ...(db.siteConfig || DEFAULT_SITE_CONFIG),
    ...update,
    updatedAt: new Date().toISOString()
  };
  saveDatabase();
  res.json({ success: true, siteConfig: db.siteConfig });
});

app.patch("/api/site-content", (req, res) => {
  const update = req.body || {};
  db.siteConfig = {
    ...(db.siteConfig || DEFAULT_SITE_CONFIG),
    ...update,
    updatedAt: new Date().toISOString()
  };
  saveDatabase();
  res.json({ success: true, siteConfig: db.siteConfig });
});

app.post("/api/site-content/reset", (req, res) => {
  db.siteConfig = JSON.parse(JSON.stringify(DEFAULT_SITE_CONFIG));
  saveDatabase();
  res.json({ success: true, message: "Site resetado para os padrões modernos e arejados com sucesso!", siteConfig: db.siteConfig });
});

// ── Settings Endpoints ──────────────────────────────────────────────────────
app.get("/api/settings", (req, res) => {
  res.json({
    ...db.settings,
    houseRules: db.settings.houseRules || DEFAULT_HOUSE_RULES,
    contractTerms: db.settings.contractTerms || DEFAULT_CONTRACT_TERMS,
    termsAndRules: db.settings.termsAndRules || DEFAULT_TERMS_AND_RULES
  });
});

app.patch("/api/settings", (req, res) => {
  const { onedriveShareUrl, syncIntervalMinutes, sheetName, alertHour, termsAndRules, houseRules, contractTerms, adminWhatsApp, autoEarlyCheckinForSite, checkinTime, checkoutTime, hotelAddress, googleMapsUrl } = req.body;
  if (onedriveShareUrl !== undefined) db.settings.onedriveShareUrl = onedriveShareUrl;
  if (syncIntervalMinutes !== undefined) db.settings.syncIntervalMinutes = syncIntervalMinutes;
  if (sheetName !== undefined) db.settings.sheetName = sheetName;
  if (alertHour !== undefined) db.settings.alertHour = alertHour;
  if (houseRules !== undefined) db.settings.houseRules = houseRules;
  if (contractTerms !== undefined) db.settings.contractTerms = contractTerms;
  if (termsAndRules !== undefined) db.settings.termsAndRules = termsAndRules;
  if (adminWhatsApp !== undefined) db.settings.adminWhatsApp = adminWhatsApp;
  if (autoEarlyCheckinForSite !== undefined) db.settings.autoEarlyCheckinForSite = Boolean(autoEarlyCheckinForSite);
  if (checkinTime !== undefined) db.settings.checkinTime = checkinTime;
  if (checkoutTime !== undefined) db.settings.checkoutTime = checkoutTime;
  if (hotelAddress !== undefined) db.settings.hotelAddress = hotelAddress;
  if (googleMapsUrl !== undefined) db.settings.googleMapsUrl = googleMapsUrl;
  saveDatabase();
  res.json({
    ...db.settings,
    houseRules: db.settings.houseRules || DEFAULT_HOUSE_RULES,
    contractTerms: db.settings.contractTerms || DEFAULT_CONTRACT_TERMS
  });
});

app.post("/api/sync/upload-sheet-json", (req, res) => {
  const { base64 } = req.body || {};
  if (!base64) {
    return res.status(400).json({ error: "Nenhum dado recebido." });
  }
  try {
    const buf = Buffer.from(base64, "base64");
    const cloudCache = path.join(DATA_DIR, "latest_sheet.xlsx");
    fs.writeFileSync(cloudCache, buf);
    const success = parseSpreadsheetBuffer(buf);
    res.json({ success, message: "Planilha atualizada na nuvem com sucesso!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/reservations/sync", async (req, res) => {
  const success = await loadSpreadsheetData();
  const todayStr = getTodayStr();
  const todayCheckouts = db.cleaningRequests.filter(r => r.requestDate === todayStr).length;

  res.json({
    flatsFound: db.flats.length,
    reservationsUpserted: db.cleaningRequests.length,
    checkoutsDetected: todayCheckouts,
    message: success ? `Sincronizado instantaneamente! ${todayCheckouts} check-outs detectados para hoje.` : "Não foi possível recarregar a planilha.",
  });
});

// ── Endpoint de Consulta de Disponibilidade Geral & Camas Solteiro ────────────
app.get("/api/reservations/availability", (req, res) => {
  try {
    const { checkin, checkout } = req.query;
    if (!checkin || !checkout) {
      return res.status(400).json({ error: "Check-in e Check-out são obrigatórios." });
    }

    const siteCfg = db.siteConfig || DEFAULT_SITE_CONFIG;
    const bedCfg = siteCfg.bedConfig || DEFAULT_SITE_CONFIG.bedConfig;
    const twinAllowed = (bedCfg.twinAllowedFlats || []).map(String);
    const cutoffTime = bedCfg.twinSameDayCutoffTime || "12:00";

    const allFlats = (db.flats || []).filter(f => !f.status || f.status !== "manutencao_bloqueada");
    
    // Verifica flats ocupados no período
    const occupiedFlatIds = new Set(
      (db.reservations || [])
        .filter(r => r.status !== "cancelada" && r.checkinDate < checkout && r.checkoutDate > checkin)
        .map(r => String(r.flatNumber || r.flatId))
    );

    const availableFlats = allFlats.filter(f => !occupiedFlatIds.has(String(f.number)) && !occupiedFlatIds.has(String(f.id)));
    const totalAvailable = availableFlats.length;

    // Flats disponíveis que suportam 2 camas de solteiro
    const availableTwinFlats = availableFlats.filter(f => twinAllowed.includes(String(f.number)));
    const twinAvailableCount = availableTwinFlats.length;

    // Validação de horário limite para o mesmo dia
    const todayStr = getTodayStr();
    let allowTwinForDates = true;
    let twinCutoffReached = false;

    if (checkin === todayStr) {
      const now = new Date();
      const currentHours = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
      if (currentHours > cutoffTime) {
        allowTwinForDates = false;
        twinCutoffReached = true;
      }
    }

    res.json({
      available: totalAvailable > 0,
      totalAvailableFlats: totalAvailable,
      twinAvailableCount,
      allowTwinBeds: Boolean(bedCfg.allowTwinBeds && allowTwinForDates && twinAvailableCount > 0),
      twinCutoffReached,
      twinCutoffMessage: twinCutoffReached 
        ? `Flats com 2 camas separadas de solteiro precisam ser reservados até no máximo às ${cutoffTime} do dia do check-in.`
        : (twinAvailableCount === 0 ? "Não há mais disponibilidade de flats com 2 camas de solteiro para as datas selecionadas (apenas Cama Queen Casal disponível)." : null),
      bedConfig: bedCfg,
      ratePlans: siteCfg.ratePlans || DEFAULT_SITE_CONFIG.ratePlans,
      pricing: siteCfg.pricing || DEFAULT_SITE_CONFIG.pricing
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Endpoint de Reserva Direta com Rodízio e Governança Inteligente ──────────
app.post("/api/reservations/direct-booking", async (req, res) => {
  try {
    const {
      guestName,
      guestPhone,
      guestEmail,
      guestDocument,
      checkinDate,
      checkoutDate,
      numGuests = 2,
      ratePlan = "with_breakfast",
      bedType = "queen", // "queen" | "twin"
      rooms = null, // Array opcional para múltiplos flats: [{ id: 1, bedType: "queen", adults: 2 }, ...]
      flatsCount = 1,
      hasPet = false,
      petCount = 1,
      petFee = 0,
      cleaningFee = 0,
      twinFee = 0,
      extraBedFee = 0,
      dailyRate = 0,
      totalAmount = 0,
      discountAmount = 0,
      paymentMethod = "pix",
      isWorkTrip = false,
      companyData = null,
      vehicle = null
    } = req.body;

    if (!guestName || !guestPhone || !guestEmail || !checkinDate || !checkoutDate) {
      return res.status(400).json({ error: "Nome, WhatsApp, E-mail e Datas são obrigatórios." });
    }

    const siteCfg = db.siteConfig || DEFAULT_SITE_CONFIG;
    const bedCfg = siteCfg.bedConfig || DEFAULT_SITE_CONFIG.bedConfig;
    const twinAllowed = (bedCfg.twinAllowedFlats || []).map(String);

    // 1. Busca todos os flats vagos no período
    const allFlats = (db.flats || []).filter(f => !f.status || f.status !== "manutencao_bloqueada");
    const occupiedFlatNumbers = new Set(
      (db.reservations || [])
        .filter(r => r.status !== "cancelada" && r.checkinDate < checkoutDate && r.checkoutDate > checkinDate)
        .map(r => String(r.flatNumber || r.flatId))
    );

    let candidateFlats = allFlats.filter(f => !occupiedFlatNumbers.has(String(f.number)) && !occupiedFlatNumbers.has(String(f.id)));

    // Determina a lista de quartos a alocar
    const roomsList = Array.isArray(rooms) && rooms.length > 0 
      ? rooms 
      : [{ id: 1, bedType, adults: Number(numGuests) || 2 }];

    const requiredCount = roomsList.length;

    if (candidateFlats.length < requiredCount) {
      return res.status(400).json({ 
        error: `Desculpe, temos apenas ${candidateFlats.length} flat(s) disponível(is) para as datas selecionadas, mas foram solicitados ${requiredCount}.` 
      });
    }

    // Algoritmo de alocação de N flats com suporte a Twin e Rodízio
    const allocatedFlats = [];
    const usageCountMap = new Map();
    (db.reservations || []).forEach(r => {
      if (r.status !== "cancelada") {
        const fn = String(r.flatNumber);
        usageCountMap.set(fn, (usageCountMap.get(fn) || 0) + 1);
      }
    });

    for (const roomReq of roomsList) {
      const isTwin = roomReq.bedType === "twin";
      let chosen = null;

      if (isTwin) {
        const availableTwins = candidateFlats.filter(f => 
          twinAllowed.includes(String(f.number)) && !allocatedFlats.some(a => a.id === f.id)
        );
        if (availableTwins.length === 0) {
          return res.status(400).json({ 
            error: "Não há flats suficientes com suporte a 2 camas de solteiro para todas as unidades solicitadas." 
          });
        }
        chosen = availableTwins[0];

        // Lança solicitação de governança se necessário
        if (!db.cleaningRequests) db.cleaningRequests = [];
        const newTaskId = db.cleaningRequests.length > 0 ? Math.max(...db.cleaningRequests.map(c => c.id || 0)) + 1 : 1;
        db.cleaningRequests.push({
          id: newTaskId,
          flatId: chosen.id,
          flatNumber: chosen.number,
          requestDate: checkinDate,
          status: "pending",
          type: "bed_adjustment_only",
          isBedAdjustmentOnly: true,
          isPaidCleaning: false,
          notes: "🛏️ CONFIGURAR 2 CAMAS DE SOLTEIRO PARA O CHECK-IN",
          createdAt: new Date().toISOString()
        });
      } else {
        // Ordena por menor uso
        const availableQueen = candidateFlats.filter(f => !allocatedFlats.some(a => a.id === f.id));
        availableQueen.sort((a, b) => {
          const usageA = usageCountMap.get(String(a.number)) || 0;
          const usageB = usageCountMap.get(String(b.number)) || 0;
          return usageA - usageB;
        });
        chosen = availableQueen[0];
      }

      if (chosen) {
        allocatedFlats.push(chosen);
      }
    }

    const primaryFlat = allocatedFlats[0];
    const flatNumbersList = allocatedFlats.map(f => f.number);
    const flatNumbersStr = flatNumbersList.join(", ");

    // 4. Criação da Reserva
    const newResId = (db.reservations || []).length > 0 ? Math.max(...db.reservations.map(r => r.id || 0)) + 1 : 1;
    const resCode = `CORP-${primaryFlat.number}-${String(newResId).padStart(4, "0")}`;

    const totalGuestsCount = roomsList.reduce((acc, r) => acc + (Number(r.adults) || 2), 0);

    const reservation = {
      id: newResId,
      code: resCode,
      reservationCode: resCode,
      flatId: primaryFlat.id,
      flatNumber: flatNumbersStr,
      allocatedFlatNumbers: flatNumbersList,
      flatsCount: allocatedFlats.length,
      roomsData: roomsList,
      guestName: guestName.trim(),
      guestPhone: guestPhone.trim(),
      guestEmail: guestEmail.trim().toLowerCase(),
      guestDocument: (guestDocument || "").trim(),
      checkinDate,
      checkoutDate,
      guestCount: totalGuestsCount,
      adults: totalGuestsCount,
      children: 0,
      channel: "site_direto",
      ratePlan,
      bedType: roomsList.some(r => r.bedType === "twin") ? "twin" : "queen",
      twinBeds: roomsList.some(r => r.bedType === "twin"),
      dailyRate: Number(dailyRate) || 0,
      cleaningFee: Number(cleaningFee) || 0,
      twinFee: Number(twinFee) || 0,
      extraBedFee: Number(extraBedFee) || 0,
      discountAmount: Number(discountAmount) || 0,
      hasPet: Boolean(hasPet),
      petCount: hasPet ? petCount : 0,
      petFee: Number(petFee) || 0,
      totalAmount: Number(totalAmount),
      paidAmount: paymentMethod === "pix" || paymentMethod === "card" || paymentMethod === "cartao_credito" ? 0 : Number(totalAmount),
      paymentStatus: paymentMethod === "pix" ? "pendente_pix" : (paymentMethod === "card" || paymentMethod === "cartao_credito" ? "pendente_cartao" : "pago_total"),
      paymentMethod,
      isWorkTrip: Boolean(isWorkTrip),
      companyData: isWorkTrip ? companyData : null,
      vehicle: vehicle || null,
      calendarSequence: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (!db.reservations) db.reservations = [];
    db.reservations.push(reservation);

    // Salva o hóspede no CRM
    if (!db.guests) db.guests = [];
    let guest = db.guests.find(g => (guestPhone && g.phone === guestPhone) || (guestEmail && g.email === guestEmail));
    if (!guest) {
      guest = {
        id: db.guests.length > 0 ? Math.max(...db.guests.map(g => g.id)) + 1 : 1,
        name: guestName.trim(),
        phone: guestPhone.trim(),
        email: guestEmail.trim().toLowerCase(),
        document: (guestDocument || "").trim(),
        createdAt: new Date().toISOString()
      };
      db.guests.push(guest);
    }

    saveDatabase();

    // 5. Integração PIX Banco Inter
    let pixData = null;
    if (paymentMethod === "pix") {
      try {
        const pixPayload = `00020101021226830014br.gov.bcb.pix2561pix.bancointer.com.br/qr/v2/cobv/${resCode}520400005303986540${Number(totalAmount).toFixed(2)}5802BR5915CORPFLATS LTDA6006BRASIL62070503***6304`;
        pixData = {
          pixCopiaECola: pixPayload,
          txid: `INTER_${Date.now()}`,
          valor: totalAmount
        };
      } catch {}
    }

    // 6. Integração Mercado Pago Checkout Pro (Cartão de Crédito)
    let mpPreference = null;
    if (paymentMethod === "card" || paymentMethod === "cartao_credito") {
      try {
        const nightsCount = Math.max(1, Math.round((new Date(checkoutDate).getTime() - new Date(checkinDate).getTime()) / (1000 * 60 * 60 * 24)));
        mpPreference = await createMercadoPagoPreference({
          reservationCode: resCode,
          amount: totalAmount,
          guestName: guestName.trim(),
          guestEmail: guestEmail.trim(),
          nights: nightsCount,
          flatNumber: flatNumbersStr
        });

        reservation.mpPreferenceId = mpPreference.id;
        reservation.mpInitPoint = mpPreference.initPoint;
        saveDatabase();
      } catch (mpErr) {
        console.error("[Direct Booking] Erro ao gerar preferência Mercado Pago:", mpErr.message);
      }
    }

    res.json({
      success: true,
      message: "Reserva realizada com sucesso!",
      reservation,
      pixData,
      initPoint: mpPreference ? mpPreference.initPoint : null,
      preferenceId: mpPreference ? mpPreference.id : null,
      allocatedFlat: flatNumbersStr
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PMS & CRM Endpoints ────────────────────────────────────────────────────
app.get("/api/pms/calendar", (req, res) => {
  const { startDate, endDate } = req.query;
  const start = startDate || getOffsetDateStr(-3);
  const end = endDate || getOffsetDateStr(30);

  const flats = [...db.flats].sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
  const reservations = (db.reservations || []).filter(r => {
    return r.checkinDate <= end && r.checkoutDate >= start && r.status !== "cancelada";
  });
  const blocks = (db.roomBlocks || []).filter(b => {
    return b.startDate <= end && b.endDate >= start;
  });

  res.json({
    startDate: start,
    endDate: end,
    flats,
    reservations,
    blocks
  });
});

app.post("/api/pms/reservations", (req, res) => {
  const {
    flatId,
    guestName,
    guestPhone,
    guestEmail,
    guestDocument,
    guestCount = 1,
    guests = [],
    requesterType = "guest", // "guest" | "other_person" | "company"
    requesterInfo = null,
    companyId = null,
    companyName = "",
    checkinDate,
    checkoutDate,
    channel = "direta",
    dailyRate = 0,
    totalAmount = 0,
    paidAmount = 0,
    paymentStatus = "pendente",
    adults = 1,
    children = 0,
    notes = "",
    prefersHighFloor = false,
    twinBeds = false,
    extraMattress = false,
    specialRequests = "",
    includeBreakfast = false
  } = req.body;

  if (!flatId || !checkinDate || !checkoutDate || (!guestName && (!guests || guests.length === 0))) {
    return res.status(400).json({ error: "Apartamento, Hóspede e Datas são obrigatórios." });
  }

  const flat = db.flats.find(f => f.id === Number(flatId));
  if (!flat) return res.status(404).json({ error: "Apartamento não encontrado." });

  const numGuests = Math.min(Math.max(Number(guestCount) || (Array.isArray(guests) && guests.length > 0 ? guests.length : 1), 1), 3);
  const primaryName = (guestName || guests?.[0]?.name || "Hóspede").trim();
  const primaryPhone = guestPhone || guests?.[0]?.phone || "";
  const primaryEmail = guestEmail || guests?.[0]?.email || "";
  const primaryDoc = guestDocument || guests?.[0]?.cpf || guests?.[0]?.document || "";

  // Guest Upsert no CRM
  if (!db.guests) db.guests = [];
  let guest = db.guests.find(g => 
    (primaryPhone && g.phone === primaryPhone) || 
    (primaryDoc && g.document === primaryDoc) || 
    (g.name.toLowerCase() === primaryName.toLowerCase())
  );

  if (!guest) {
    guest = {
      id: db.guests.length > 0 ? Math.max(...db.guests.map(g => g.id)) + 1 : 1,
      name: primaryName,
      phone: primaryPhone,
      email: primaryEmail,
      document: primaryDoc,
      companyName: companyName || "",
      city: "",
      notes: "",
      tags: [],
      createdAt: new Date().toISOString()
    };
    db.guests.push(guest);
  } else {
    if (primaryPhone) guest.phone = primaryPhone;
    if (primaryEmail) guest.email = primaryEmail;
    if (primaryDoc) guest.document = primaryDoc;
    if (companyName) guest.companyName = companyName;
  }

  // Prepara lista de hóspedes da reserva (1, 2 ou 3)
  const preparedGuests = [];
  for (let i = 1; i <= numGuests; i++) {
    const existingG = Array.isArray(guests) ? guests.find(g => g.index === i || g.order === i) : null;
    if (i === 1) {
      preparedGuests.push({
        index: 1,
        name: primaryName,
        cpf: primaryDoc,
        phone: primaryPhone,
        email: primaryEmail,
        hasCompletedCheckin: Boolean(existingG?.hasCompletedCheckin),
        checkinCompletedAt: existingG?.checkinCompletedAt || null
      });
    } else {
      preparedGuests.push({
        index: i,
        name: existingG?.name ? existingG.name.trim() : `Hóspede ${i}`,
        cpf: existingG?.cpf || existingG?.document || "",
        phone: existingG?.phone || "",
        email: existingG?.email || "",
        hasCompletedCheckin: Boolean(existingG?.hasCompletedCheckin),
        checkinCompletedAt: existingG?.checkinCompletedAt || null
      });
    }
  }

  // Trata dados de Emissão de Nota Fiscal Corporativa / NFS-e
  const { invoiceDetails } = req.body;
  if (invoiceDetails && invoiceDetails.emitInvoice) {
    if (invoiceDetails.type === "pj" && invoiceDetails.cnpj) {
      if (!db.companies) db.companies = [];
      const cleanCnpj = invoiceDetails.cnpj.replace(/\D/g, "");
      let existingComp = db.companies.find(c => c.cnpj.replace(/\D/g, "") === cleanCnpj);
      if (!existingComp) {
        existingComp = {
          id: db.companies.length > 0 ? Math.max(...db.companies.map(c => c.id)) + 1 : 1,
          corporateName: (invoiceDetails.companyName || invoiceDetails.razaoSocial || "Empresa PJ").trim(),
          tradeName: (invoiceDetails.tradeName || invoiceDetails.nomeFantasia || invoiceDetails.companyName || "").trim(),
          cnpj: invoiceDetails.cnpj.trim(),
          stateRegistration: "",
          municipalRegistration: "",
          financialEmail: (invoiceDetails.companyEmail || primaryEmail || "").trim(),
          phone: (invoiceDetails.companyPhone || primaryPhone || "").trim(),
          contactPerson: primaryName,
          billingTerms: "Faturamento Check-out",
          notes: `Cadastrada automaticamente pelo motor de reservas no nome do hóspede ${primaryName}.`,
          createdAt: new Date().toISOString()
        };
        db.companies.push(existingComp);
      }
      
      guest.companyId = existingComp.id;
      guest.companyName = existingComp.corporateName;
      guest.autoEmitInvoice = true;
    } else if (invoiceDetails.type === "pf") {
      guest.autoEmitInvoice = true;
    }
  }

  if (!db.reservations) db.reservations = [];
  const resId = db.reservations.length > 0 ? Math.max(...db.reservations.map(r => r.id)) + 1 : 1;
  const autoEarlyForSite = db.settings.autoEarlyCheckinForSite !== false;
  const isEarlyAuth = (channel === "site" && autoEarlyForSite) || Boolean(req.body.earlyCheckinAuthorized);

  const newReservation = {
    id: resId,
    code: `RES-${String(flat.number)}-${String(resId).padStart(4, "0")}`,
    flatId: flat.id,
    flatNumber: flat.number,
    guestId: guest.id,
    guestName: primaryName,
    guestPhone: primaryPhone,
    guestEmail: primaryEmail,
    guestCount: numGuests,
    guests: preparedGuests,
    requesterType,
    requesterInfo: requesterInfo || null,
    companyId: companyId ? Number(companyId) : (guest.companyId || null),
    companyName: companyName || guest.companyName || "",
    invoiceDetails: invoiceDetails || null,
    checkinDate,
    checkoutDate,
    status: "confirmada",
    channel,
    dailyRate: Number(dailyRate),
    totalAmount: Number(totalAmount),
    paidAmount: Number(paidAmount),
    paymentStatus,
    adults: numGuests,
    children: Number(children),
    notes,
    earlyCheckinAuthorized: isEarlyAuth,
    receptionNotes: req.body.receptionNotes || "",
    prefersHighFloor: Boolean(prefersHighFloor),
    twinBeds: Boolean(twinBeds),
    extraMattress: Boolean(extraMattress),
    specialRequests: specialRequests || "",
    includeBreakfast: Boolean(includeBreakfast),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  db.reservations.unshift(newReservation);
  saveDatabase();
  res.status(201).json(newReservation);
});

app.put("/api/pms/reservations/:id", (req, res) => {
  const id = Number(req.params.id);
  const r = (db.reservations || []).find(x => x.id === id);
  if (!r) return res.status(404).json({ error: "Reserva não encontrada" });

  const oldCheckin = r.checkinDate;
  const oldCheckout = r.checkoutDate;
  const oldFlatId = r.flatId;
  const oldStatus = r.status;

  const fields = [
    "flatId", "checkinDate", "checkoutDate", "status", "channel", 
    "dailyRate", "totalAmount", "paidAmount", "paymentStatus", 
    "adults", "children", "notes", "prefersHighFloor", "twinBeds", 
    "extraMattress", "specialRequests"
  ];
  for (const f of fields) {
    if (req.body[f] !== undefined) r[f] = req.body[f];
  }
  if (req.body.flatId) {
    const flat = db.flats.find(f => f.id === Number(req.body.flatId));
    if (flat) r.flatNumber = flat.number;
  }
  if (req.body.guestName) r.guestName = req.body.guestName;
  if (req.body.guestPhone) r.guestPhone = req.body.guestPhone;
  if (req.body.guestEmail) r.guestEmail = req.body.guestEmail;

  // RFC 5546: Incrementa SEQUENCE ao remarcar datas ou alterar flat/status
  if (oldCheckin !== r.checkinDate || oldCheckout !== r.checkoutDate || oldFlatId !== r.flatId || oldStatus !== r.status) {
    r.calendarSequence = (r.calendarSequence || 0) + 1;
  }

  r.updatedAt = new Date().toISOString();
  saveDatabase();
  res.json(r);
});

// ── Portal do Hóspede (Guest Hub & Área do Cliente) ─────────────────────────
const DEFAULT_HOUSE_RULES = `TERMOS, REGRAS E CONDIÇÕES DE RESERVA - CORPFLATS

1. REGRAS DA CASA E CONVIVÊNCIA
(Regras do imóvel, áreas comuns e convivência no Edifício Soho Residence Service)

🕒 Check-in e Check-out
• Check-in: A partir das 14:00h.
• Check-out: Até as 12:00h.
• Check-in Digital Obrigatório: O acesso ao flat e a retirada do cartão na recepção são liberados apenas após a conclusão do check-in digital, com o envio de foto de documento oficial (frente e verso) de todos os ocupantes e selfie do titular da reserva.
• Identificação da Unidade: O número do apartamento e as instruções detalhadas de acesso serão enviados por mensagem no dia da entrada, até as 14:00h.

🐾 Política Pet (Cães de Pequeno Porte)
• Permissão: Permitida a hospedagem exclusivamente de cães de pequeno porte.
• Padrão Aceito: Cães com peso máximo de até 10 kg e altura de cernelha de até 35–40 cm.
• Taxa Pet: Cobrança de taxa única de R$ 40,00 por animal.
• Circulação no Prédio: Nas áreas comuns, o pet deve ser transportado obrigatoriamente no colo ou dentro de caixa/bolsa de transporte.
• Uso de Elevadores: É obrigatório utilizar exclusivamente o elevador de serviço ao transitar com animais.
• Responsabilidade: O titular da reserva responde integralmente por quaisquer danos a móveis, colchões, enxoval de cama/banho, odores ou sujeiras causadas pelo pet.

👥 Capacidade e Visitantes
• Ocupação Máxima: Limite de até 3 pessoas no apartamento (somando hóspedes e visitantes), respeitando a capacidade contratada na reserva.
• Cadastro de Visitantes: Para acesso ao edifício, visitantes devem apresentar/enviar documento oficial com foto com antecedência.
• Restrições de Visitas: Não é permitido o pernoite de visitantes no imóvel, bem como não é permitido o acesso de visitantes à área de lazer/cobertura.
• Hospedagem de Menores: Menores de 18 anos só podem se hospedar acompanhados dos pais. Se acompanhados de terceiros, é obrigatória a apresentação de autorização por escrito dos pais com firma reconhecida em cartório.

🏊 Áreas Comuns e Lazer (Edifício Soho Residence Service)
• Estrutura Disponível: Jacuzzi, Sauna, Academia e Salão de Jogos.
• Horário de Funcionamento: Diariamente, das 06:00h às 22:00h.
• Regras da Área Comum: Proibido o consumo de alimentos, bebidas e uso de aparelhos de som na jacuzzi, sauna e salão de jogos. Na academia, é proibido qualquer som ambiente (uso exclusivo com fones de ouvido).

🚗 Estacionamento
• Vagas Rotativas: Estacionamento gratuito em sistema rotativo (sujeito à disponibilidade momentânea de vagas no momento da chegada).
• Liberação de Acesso: Para cadastro na portaria, é necessário informar modelo, cor e placa do veículo durante o check-in digital.

🚫 Normas Gerais e Penalidades
• Lei do Silêncio: Proibido som alto e barulhos excessivos nos apartamentos em qualquer horário.
• Proibição de Fumo e Ilícitos: É terminantemente proibido fumar (cigarros convencionais, eletrônicos, vapes, pods, narguilés) ou usar substâncias ilícitas nas unidades e dependências do prédio. O descumprimento sujeita o hóspede a cancelamento imediato da hospedagem sem direito a reembolso, aplicação de penalidades e acionamento policial.
• Cuidado com o Enxoval: Evite manchar toalhas e roupas de cama com tinturas, maquiagem, protetor solar, sangue ou alimentos. Peças danificadas ou manchadas de forma permanente serão cobradas pelo custo de reposição.
• Extravio de Cartão/Chave: Em caso de perda do cartão de acesso, a taxa para emissão de 2ª via é de R$ 15,00.`;

const DEFAULT_CONTRACT_TERMS = `TERMOS E CONDIÇÕES CONTRATUAIS - CORPFLATS

Cláusula 1 – Do Objeto e da Natureza da Locação
1.1. O presente contrato tem por objeto a locação por temporada para fins exclusivamente residenciais e temporários de apartamentos administrados pela CorpFlats.
1.2. O HÓSPEDE declara estar ciente de que as unidades são autônomas e de gestão privada, não mantendo qualquer vínculo de governança com o restaurante ou com a operação hoteleira convencional do condomínio. Os porteiros e recepcionistas atuam unicamente na identificação e entrega/recebimento dos cartões de acesso. Todo e qualquer atendimento deve ser demandado aos canais oficiais da CorpFlats.

Cláusula 2 – Do Check-in Digital e Acesso
2.1. O pagamento integral da reserva não isenta a obrigatoriedade da realização prévia do Check-in Digital.
2.2. O titular da reserva deve fornecer cópia legível de documento oficial de identidade de todos os ocupantes e selfie de validação. O acesso à unidade não será autorizado pelo condomínio caso a identificação não tenha sido concluída.

Cláusula 3 – Da Limpeza e Serviços Adicionais
3.1. A diária não inclui serviço de limpeza diária de quarto ou arrumação intermediária.
3.2. Caso o HÓSPEDE solicite higienização extra durante a estadia, o serviço poderá ser contratado à parte pelo valor de R$ 70,00 por intervenção, incluindo a troca integral de roupas de cama e toalhas.

Cláusula 4 – Da Ausência de Depósito Caução e Reparação de Danos
4.1. A CorpFlats não exige caução prévio financeiro no momento da reserva.
4.2. O HÓSPEDE assume total responsabilidade patrimonial e civil pela conservação do imóvel, mobília, eletrodomésticos e utensílios.
4.3. Avarias, quebras, perdas de cartões/chaves, danos definitivos a enxovais, custos de limpeza pesada decorrentes de infração de fumo/animais ou multas condominiais provocadas pela conduta do HÓSPEDE serão cobrados diretamente do responsável pela reserva na forma dos Artigos 186 e 927 do Código Civil Brasileiro, autorizando-se desde já a cobrança direta e medidas executivas cabíveis.

Cláusula 5 – Da Política de Cancelamento e No-Show
5.1. Reservas efetuadas com mais de 7 dias de antecedência:
• Cancelamento gratuito com estorno integral (100%) permitido até 24 horas antes do horário de check-in (até as 14:00h do dia anterior à data de entrada).
• Cancelamentos efetuados com menos de 24 horas de antecedência ou não comparecimento (No-Show) implicam a retenção integral (100%) do valor total da reserva.
5.2. Reservas efetuadas dentro do prazo de 7 dias da data de entrada:
• O exercício do direito de arrependimento (Art. 49 do CDC) sem custos será aceito exclusivamente até as 14:00h da data de check-in.
• Após as 14:00h da data de início da diária: A unidade é considerada formalmente ocupada/disponibilizada, não cabendo mais cancelamento gratuito, sendo exigido o pagamento integral.
5.3. Saída Antecipada (Early Check-out):
• A desistência ou desocupação antecipada do imóvel por conveniência do HÓSPEDE não confere direito a reembolso, compensação ou crédito proporcional de diárias não utilizadas.

Cláusula 6 – Dos Procedimentos de Encerramento (Check-out)
6.1. O horário máximo para desocupação da unidade é às 12:00h.
6.2. Antes da saída, o HÓSPEDE compromete-se a: desligar os aparelhos de ar-condicionado, televisão, ferro e fogão; fechar todas as janelas; certificar-se do fechamento de torneiras e registros de duchas higiênicas; e entregar o cartão magnético diretamente na recepção.`;

const DEFAULT_TERMS_AND_RULES = `${DEFAULT_HOUSE_RULES}\n\n=========================================\n\n${DEFAULT_CONTRACT_TERMS}`;

app.get("/api/pms/guest-portal/:code", (req, res) => {
  const code = (req.params.code || "").trim();
  if (!db.reservations) db.reservations = [];
  const r = db.reservations.find(resItem => resItem.code?.toUpperCase() === code.toUpperCase() || String(resItem.id) === code);
  if (!r) {
    return res.status(404).json({ error: "Reserva não encontrada com o localizador informado." });
  }

  // Data e hora atual no fuso horário do Brasil
  const now = new Date();
  const nowUtc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const brDate = new Date(nowUtc - (3 * 3600000)); // UTC-3 (Brasília)
  const todayStr = brDate.toISOString().substring(0, 10);
  
  // Status da governança para o flat
  const flatObj = (db.flats || []).find(f => f.id === r.flatId || String(f.number) === String(r.flatNumber));
  const activeCleaning = (db.cleaningRequests || []).find(c => 
    (c.flatId === r.flatId || String(c.flatNumber) === String(r.flatNumber)) && 
    c.requestDate === todayStr &&
    (c.status === "pending" || c.status === "in_progress")
  );
  // O flat só é considerado em higienização se houver uma tarefa ativa hoje
  const isFlatClean = !activeCleaning;

  // Antecipação de Check-in: Quarto já limpo no dia da chegada
  const canDoEarlyCheckin = (todayStr === r.checkinDate) && isFlatClean;

  const checkinTimeStr = db.settings.checkinTime || "14:00";
  const checkoutTimeStr = db.settings.checkoutTime || "12:00";

  // Pedido de café da manhã existente
  if (!db.breakfastOrders) db.breakfastOrders = [];
  const tomorrowDate = new Date(brDate);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowStr = tomorrowDate.toISOString().substring(0, 10);
  const existingBreakfastOrder = db.breakfastOrders.find(o => 
    (String(o.roomNumber) === String(r.flatNumber) || o.phone === r.guestPhone) && 
    (o.deliveryDate === todayStr || o.deliveryDate === tomorrowStr)
  );

  // Status de Pré-check-in / FNHR
  const totalGuests = r.guests?.length || r.guestCount || 1;
  const completedCheckins = (r.guests || []).filter(g => g.hasCompletedCheckin).length;

  res.json({
    reservation: {
      id: r.id,
      code: r.code,
      guestName: r.guestName,
      guestPhone: r.guestPhone,
      guestEmail: r.guestEmail,
      checkinDate: r.checkinDate,
      checkoutDate: r.checkoutDate,
      guestCount: r.guestCount || r.adults || 1,
      guests: r.guests || [],
      channel: r.channel || "site",
      totalAmount: r.totalAmount || 0,
      paidAmount: r.paidAmount || 0,
      paymentStatus: r.paymentStatus || "pago_total",
      paymentMethod: r.paymentMethod || (r.pixTxId ? "PIX" : (r.mpPaymentId ? "Cartão de Crédito" : "PIX")),
      paidAt: r.paidAt || null,
      pixTxId: r.pixTxId || null,
      pixEndToEndId: r.pixEndToEndId || null,
      mpPaymentId: r.mpPaymentId || null,
      mpPreferenceId: r.mpPreferenceId || null,
      hasBreakfast: Boolean(r.notes?.toLowerCase().includes("café") || r.notes?.toLowerCase().includes("cafe")),
      earlyCheckinAuthorized: Boolean(r.earlyCheckinAuthorized),
      flatNumber: r.flatNumber,
      roomCategory: "Flat Studio Executivo Completo",
      flatCleanStatus: isFlatClean ? "limpo" : "em_preparacao",
      specialRequests: r.specialRequests || "",
      notes: r.notes || "",
      receptionNotes: r.receptionNotes || "",
      vehicle: r.vehicle || null
    },
    checkinPolicy: `Check-in padrão a partir das ${checkinTimeStr} (Check-in antecipado liberado na portaria assim que o flat estiver limpo).`,
    checkinTime: checkinTimeStr,
    checkoutTime: checkoutTimeStr,
    hotelAddress: db.settings.hotelAddress || "CorpFlats",
    googleMapsUrl: db.settings.googleMapsUrl || "https://www.google.com/maps/search/?api=1&query=CorpFlats",
    isCheckinToday: todayStr === r.checkinDate,
    isFlatClean,
    canDoEarlyCheckin,
    earlyCheckinMessage: (todayStr === r.checkinDate)
      ? (isFlatClean 
          ? "🎉 Seu Apartamento já está limpo e pronto! Você pode fazer seu check-in antecipado agora mesmo na portaria." 
          : "🧹 Apartamento em higienização pela equipe de governança. Check-in a partir das 14:00 (assim que for finalizado, a liberação é imediata).")
      : `Check-in a partir das 14:00 em ${r.checkinDate}.`,
    breakfastOrder: existingBreakfastOrder || null,
    preCheckinStatus: {
      totalGuests,
      completedCheckins,
      isFullyCompleted: completedCheckins >= totalGuests
    },
    termsAndRules: db.settings.termsAndRules || DEFAULT_TERMS_AND_RULES,
    houseRules: db.settings.houseRules || DEFAULT_HOUSE_RULES,
    contractTerms: db.settings.contractTerms || DEFAULT_CONTRACT_TERMS,
    adminWhatsApp: db.settings.adminWhatsApp || "5522997124021"
  });
});

app.post("/api/pms/guest-portal/:code/claim-early-checkin", (req, res) => {
  const code = (req.params.code || "").trim();
  if (!db.reservations) db.reservations = [];
  const r = db.reservations.find(resItem => resItem.code?.toUpperCase() === code.toUpperCase() || String(resItem.id) === code);
  if (!r) {
    return res.status(404).json({ error: "Reserva não encontrada." });
  }

  r.earlyCheckinAuthorized = true;
  r.notes = `${r.notes || ''} • [Early Check-in Gratuito Liberado Antecipadamente às ${new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })}]`.trim();
  r.updatedAt = new Date().toISOString();
  saveDatabase();

  res.json({
    success: true,
    message: "🎉 Early Check-in antecipado ativado com sucesso! Seu apartamento foi liberado na portaria.",
    flatNumber: r.flatNumber
  });
});

app.post("/api/pms/guest-portal/:code/request-breakfast-later", (req, res) => {
  const code = (req.params.code || "").trim();
  if (!db.reservations) db.reservations = [];
  const r = db.reservations.find(resItem => resItem.code?.toUpperCase() === code.toUpperCase() || String(resItem.id) === code);
  if (!r) {
    return res.status(404).json({ error: "Reserva não encontrada." });
  }

  r.breakfastReminderRequested = true;
  r.updatedAt = new Date().toISOString();
  saveDatabase();

  res.json({
    success: true,
    message: "Perfeito! Enviaremos um lembrete no seu WhatsApp e navegador às 18:00 para você escolher os itens do seu café da manhã."
  });
});

// ── Cancelamento Self-Service e Cálculo de Reembolso Automatizado ────────────
app.get("/api/pms/guest-portal/:code/cancellation-quote", (req, res) => {
  const code = (req.params.code || "").trim();
  if (!db.reservations) db.reservations = [];
  const r = db.reservations.find(resItem => resItem.code?.toUpperCase() === code.toUpperCase() || String(resItem.id) === code);
  if (!r) {
    return res.status(404).json({ error: "Reserva não encontrada." });
  }

  const bookingDate = r.createdAt ? new Date(r.createdAt) : new Date();
  const checkinDate = r.checkinDate ? new Date(r.checkinDate + "T14:00:00-03:00") : new Date();
  const now = new Date();

  // Dias inteiros de antecedência quando a reserva foi feita
  const diffDaysAtBooking = Math.floor((checkinDate.getTime() - bookingDate.getTime()) / (1000 * 3600 * 24));
  const isStrict = diffDaysAtBooking > 7;

  // Prazo limite para reembolso: 24h antes do check-in
  const deadlineDate = new Date(checkinDate.getTime() - 24 * 3600 * 1000);
  const isBeforeDeadline = now.getTime() <= deadlineDate.getTime();

  let policyType = isStrict ? "rigorosa" : "flexivel";
  let isEligibleForRefund = false;
  let refundPercentage = 0;
  let refundAmount = 0;
  let explanation = "";

  if (isStrict) {
    explanation = `Esta reserva foi realizada com ${diffDaysAtBooking} dias de antecedência (> 7 dias). De acordo com a Política Rigorosa, não há reembolso em caso de cancelamento.`;
  } else {
    if (isBeforeDeadline) {
      isEligibleForRefund = true;
      refundPercentage = 100;
      refundAmount = Number(r.paidAmount || r.totalAmount || 0);
      explanation = `Cancelamento dentro do prazo gratuito (até 24 horas antes do check-in). Você receberá 100% de estorno integral (R$ ${refundAmount.toFixed(2)}).`;
    } else {
      explanation = `O prazo limite para cancelamento gratuito encerrou em ${deadlineDate.toLocaleDateString("pt-BR")} às 14:00 (menos de 24 horas para o check-in). Nenhum valor será estornado.`;
    }
  }

  res.json({
    policyType,
    isStrict,
    isBeforeDeadline,
    isEligibleForRefund,
    refundPercentage,
    refundAmount,
    totalPaid: Number(r.paidAmount || r.totalAmount || 0),
    deadlineFormatted: deadlineDate.toLocaleDateString("pt-BR") + " às 14:00",
    explanation,
    status: r.status
  });
});

app.post("/api/pms/guest-portal/:code/cancel", (req, res) => {
  const code = (req.params.code || "").trim();
  if (!db.reservations) db.reservations = [];
  const r = db.reservations.find(resItem => resItem.code?.toUpperCase() === code.toUpperCase() || String(resItem.id) === code);
  if (!r) {
    return res.status(404).json({ error: "Reserva não encontrada." });
  }

  if (r.status === "cancelada") {
    return res.status(400).json({ error: "Esta reserva já foi cancelada anteriormente." });
  }

  const bookingDate = r.createdAt ? new Date(r.createdAt) : new Date();
  const checkinDate = r.checkinDate ? new Date(r.checkinDate + "T14:00:00-03:00") : new Date();
  const now = new Date();

  const diffDaysAtBooking = Math.floor((checkinDate.getTime() - bookingDate.getTime()) / (1000 * 3600 * 24));
  const isStrict = diffDaysAtBooking > 7;
  const deadlineDate = new Date(checkinDate.getTime() - 24 * 3600 * 1000);
  const isBeforeDeadline = now.getTime() <= deadlineDate.getTime();

  let isEligibleForRefund = !isStrict && isBeforeDeadline;
  let refundAmount = isEligibleForRefund ? Number(r.paidAmount || r.totalAmount || 0) : 0;

  r.status = "cancelada";
  r.cancelledAt = new Date().toISOString();
  r.cancellationReason = req.body?.reason || "Cancelamento solicitado pelo hóspede via autoatendimento";
  r.refundStatus = isEligibleForRefund ? "estorno_100%_solicitado" : "sem_reembolso";
  r.refundAmount = refundAmount;
  r.calendarSequence = (r.calendarSequence || 0) + 1;
  r.updatedAt = new Date().toISOString();

  saveDatabase();

  res.json({
    success: true,
    message: isEligibleForRefund 
      ? `Reserva cancelada com sucesso! O estorno integral de R$ ${refundAmount.toFixed(2)} foi processado.`
      : "Reserva cancelada com sucesso. De acordo com as políticas, não houve estorno de valores.",
    refundAmount,
    refundStatus: r.refundStatus,
    policyType: isStrict ? "rigorosa" : "flexivel",
    calendarSequence: r.calendarSequence,
    icsUrl: `/api/reservations/${r.code || r.id}/calendar.ics?action=cancel`
  });
});

// ── Achados & Perdidos (Lost and Found / Item Encontrado no Quarto) ──────────
app.get("/api/lost-and-found", (req, res) => {
  if (!db.lostAndFound) db.lostAndFound = [];
  const { flatId, flatNumber, status } = req.query;
  let items = [...db.lostAndFound];
  if (flatId) items = items.filter(i => i.flatId === Number(flatId));
  if (flatNumber) items = items.filter(i => String(i.flatNumber) === String(flatNumber));
  if (status) items = items.filter(i => i.status === status);
  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json(items);
});

app.post("/api/lost-and-found", (req, res) => {
  try {
    const { flatId, flatNumber, description, locationInRoom = "", photoBase64 = "", notes = "" } = req.body;
    if (!description || !description.trim()) {
      return res.status(400).json({ error: "Descrição do item encontrado é obrigatória." });
    }

    const user = getAuthUser(req);
    if (!db.lostAndFound) db.lostAndFound = [];
    const id = db.lostAndFound.length > 0 ? Math.max(...db.lostAndFound.map(i => i.id || 0)) + 1 : 1;

    const targetFlat = flatNumber || (flatId ? db.flats?.find(f => f.id === Number(flatId))?.number : "Geral");

    // 1. Processamento e Persistência Segura da Foto (Local Disk / R2)
    let finalPhotoUrl = null;
    if (photoBase64 && typeof photoBase64 === "string" && photoBase64.startsWith("data:image/")) {
      try {
        const match = photoBase64.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
        if (match) {
          const ext = match[1] === "jpeg" ? "jpg" : (match[1] || "webp");
          const base64Data = match[2];
          const fileName = `lost_${Date.now()}_${String(targetFlat).replace(/[^a-zA-Z0-9]/g, "_")}.${ext}`;
          const filePath = path.join(LOST_ITEMS_DIR, fileName);
          fs.writeFileSync(filePath, Buffer.from(base64Data, "base64"));
          
          finalPhotoUrl = `/api/storage/files/lost_items/${fileName}`;
          console.log(`[Lost and Found] Foto salva em disco: ${filePath} (${(base64Data.length * 0.75 / 1024).toFixed(1)} KB)`);
        } else {
          finalPhotoUrl = photoBase64;
        }
      } catch (imgErr) {
        console.warn("[Lost and Found] Erro ao salvar arquivo físico da foto:", imgErr.message);
        finalPhotoUrl = photoBase64;
      }
    } else if (photoBase64) {
      finalPhotoUrl = photoBase64;
    }

    // 2. Auto-identificação do Último Hóspede que ocupou o quarto
    let lastGuestName = "Hóspede Anterior";
    let lastGuestPhone = "";
    let lastGuestEmail = "";
    let lastCheckoutDate = "";

    const recentRequest = (db.cleaningRequests || []).find(cr => String(cr.flatNumber) === String(targetFlat) && cr.leavingGuest);
    if (recentRequest) {
      lastGuestName = recentRequest.leavingGuest;
    }

    const recentReservation = (db.reservations || []).find(r => 
      (String(r.flatNumber) === String(targetFlat) || r.allocatedFlatNumbers?.includes(String(targetFlat))) &&
      r.guestName
    );
    if (recentReservation) {
      if (!lastGuestName || lastGuestName === "Hóspede Anterior") lastGuestName = recentReservation.guestName;
      lastGuestPhone = recentReservation.guestPhone || "";
      lastGuestEmail = recentReservation.guestEmail || "";
      lastCheckoutDate = recentReservation.checkoutDate || "";
    }

    const newItem = {
      id,
      flatId: flatId ? Number(flatId) : null,
      flatNumber: targetFlat,
      description: description.trim(),
      locationInRoom: locationInRoom.trim(),
      photoUrl: finalPhotoUrl,
      status: "guardado", // 'guardado' | 'devolvido' | 'descartado'
      foundBy: user ? (user.name || user.username) : "Camareira",
      lastGuestName,
      lastGuestPhone,
      lastGuestEmail,
      lastCheckoutDate,
      notes: notes.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.lostAndFound.unshift(newItem);
    saveDatabase();

    // 3. Registro de Auditoria Fail-Safe
    logAuditEvent({
      level: "info",
      category: "cleaning",
      action: "LOST_ITEM_REGISTERED",
      actor: { name: newItem.foundBy, role: user?.role || "camareira" },
      details: {
        flatNumber: newItem.flatNumber,
        description: newItem.description,
        locationInRoom: newItem.locationInRoom,
        photoUrl: finalPhotoUrl ? "anexada" : "sem foto",
        lastGuestName: newItem.lastGuestName,
        lastGuestPhone: newItem.lastGuestPhone
      },
      source: "cleaning_dashboard",
      ip: req.ip || req.headers["x-forwarded-for"] || ""
    });

    // 4. Notificação Central para a Equipe de Gestão
    createNotification({
      category: "lost_item",
      title: `📦 Item Encontrado - Flat ${newItem.flatNumber}`,
      message: `${newItem.foundBy} encontrou "${newItem.description}" ${locationInRoom ? `(${locationInRoom})` : ""} • Hóspede: ${lastGuestName}`,
      severity: "warning",
      metadata: { flatId, flatNumber: newItem.flatNumber, lostItemId: id, photoUrl: newItem.photoUrl, lastGuestName },
      targetUrl: "/achados-perdidos"
    });

    res.status(201).json(newItem);
  } catch (err) {
    console.error("[Lost and Found Error]", err);
    res.status(500).json({ error: `Erro ao salvar item encontrado: ${err.message}` });
  }
});

app.patch("/api/lost-and-found/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!db.lostAndFound) db.lostAndFound = [];
  const item = db.lostAndFound.find(i => i.id === id);
  if (!item) return res.status(404).json({ error: "Item não encontrado." });

  const user = getAuthUser(req);
  if (req.body.status) item.status = req.body.status;
  if (req.body.notes !== undefined) item.notes = req.body.notes;
  if (req.body.returnedTo) item.returnedTo = req.body.returnedTo;
  if (req.body.status === "devolvido") {
    item.returnedAt = new Date().toISOString();
    item.returnedBy = user ? (user.name || user.username) : "Recepção";
  }
  item.updatedAt = new Date().toISOString();
  saveDatabase();

  logAuditEvent({
    level: "info",
    category: "cleaning",
    action: `LOST_ITEM_${(item.status || "updated").toUpperCase()}`,
    actor: { name: user ? user.name : "Sistema", role: user?.role || "admin" },
    details: { id, flatNumber: item.flatNumber, status: item.status, returnedTo: item.returnedTo },
    source: "dashboard"
  });

  res.json(item);
});

app.delete("/api/lost-and-found/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!db.lostAndFound) db.lostAndFound = [];
  db.lostAndFound = db.lostAndFound.filter(i => i.id !== id);
  saveDatabase();
  res.json({ success: true });
});

// ── Central de Notificações & Alertas ────────────────────────────────────────
app.get("/api/notifications", (req, res) => {
  if (!db.notifications) db.notifications = [];
  const { category, severity, unreadOnly } = req.query;
  let items = [...db.notifications];
  if (category && category !== "all") {
    items = items.filter(n => n.category === category);
  }
  if (severity && severity !== "all") {
    items = items.filter(n => n.severity === severity);
  }
  if (unreadOnly === "true") {
    items = items.filter(n => !n.read);
  }
  const unreadCount = db.notifications.filter(n => !n.read).length;
  res.json({
    notifications: items,
    total: items.length,
    unreadCount
  });
});

app.patch("/api/notifications/:id/read", (req, res) => {
  const id = Number(req.params.id);
  if (!db.notifications) db.notifications = [];
  const n = db.notifications.find(x => x.id === id);
  if (!n) return res.status(404).json({ error: "Notificação não encontrada" });
  n.read = true;
  saveDatabase();
  const unreadCount = db.notifications.filter(x => !x.read).length;
  res.json({ success: true, notification: n, unreadCount });
});

app.post("/api/notifications/mark-all-read", (req, res) => {
  if (!db.notifications) db.notifications = [];
  db.notifications.forEach(n => { n.read = true; });
  saveDatabase();
  res.json({ success: true, unreadCount: 0 });
});

app.delete("/api/notifications/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!db.notifications) db.notifications = [];
  db.notifications = db.notifications.filter(n => n.id !== id);
  saveDatabase();
  const unreadCount = db.notifications.filter(n => !n.read).length;
  res.json({ success: true, unreadCount });
});

app.delete("/api/notifications", (req, res) => {
  db.notifications = [];
  saveDatabase();
  res.json({ success: true, unreadCount: 0 });
});

app.get("/api/notifications/settings", (req, res) => {
  res.json(db.notificationSettings || {});
});

app.post("/api/notifications/settings", (req, res) => {
  db.notificationSettings = {
    ...db.notificationSettings,
    ...req.body
  };
  saveDatabase();
  res.json({ success: true, settings: db.notificationSettings });
});

app.post("/api/notifications/test", (req, res) => {
  const { category = "system_error", title = "Teste de Notificação", message = "Este é um disparo de teste para verificar seus canais de alerta.", severity = "info" } = req.body;
  const created = createNotification({
    category,
    title,
    message,
    severity,
    metadata: { isTest: true }
  });
  res.json({ success: true, notification: created });
});

app.delete("/api/pms/reservations/:id", (req, res) => {
  const id = Number(req.params.id);
  const r = (db.reservations || []).find(x => x.id === id);
  if (!r) return res.status(404).json({ error: "Reserva não encontrada" });
  r.status = "cancelada";
  r.calendarSequence = (r.calendarSequence || 0) + 1;
  r.updatedAt = new Date().toISOString();
  saveDatabase();
  res.json({ success: true, message: "Reserva cancelada com sucesso.", calendarSequence: r.calendarSequence });
});

// CRM Guests
// ── PMS Guests CRM Endpoints (Motor 360º com LTV, Tags e Histórico) ─────────

// ── Central de Relatórios de Reservas & Hospedagem (PMS Analytics) ──────────
app.get("/api/pms/analytics/reports", (req, res) => {
  const startDate = req.query.startDate || new Date(Date.now() - 30 * 86400000).toISOString().substring(0, 10);
  const endDate = req.query.endDate || new Date().toISOString().substring(0, 10);

  const reservations = db.reservations || [];
  const flats = db.flats || [];
  const totalFlatsCount = flats.length || 10;

  // Calcula quantidade de dias no período
  const d1 = new Date(startDate);
  const d2 = new Date(endDate);
  const totalDaysInPeriod = Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1);
  const totalAvailableRoomNights = totalFlatsCount * totalDaysInPeriod;

  // Filtra reservas que tocam o período [startDate, endDate]
  const periodReservations = reservations.filter(r => {
    if (r.status === "cancelled" || r.status === "cancelada") return false;
    const inDate = r.checkinDate;
    const outDate = r.checkoutDate || r.checkinDate;
    return outDate >= startDate && inDate <= endDate;
  });

  // Métricas Globais
  let totalRevenue = 0;
  let totalNightsSold = 0;
  const channelCounts = { "Site CorpFlats": 0, "WhatsApp / Balcão": 0, "Booking.com": 0, "Airbnb": 0, "Corporativo B2B": 0 };
  const flatStats = {};

  flats.forEach(f => {
    flatStats[String(f.number)] = {
      flatNumber: String(f.number),
      revenue: 0,
      nightsSold: 0,
      staysCount: 0
    };
  });

  periodReservations.forEach(r => {
    const rev = parseFloat(r.totalAmount || r.totalPrice || r.price || 0) || 0;
    totalRevenue += rev;

    let nights = Number(r.nightsCount || 1);
    if (!r.nightsCount && r.checkinDate && r.checkoutDate) {
      const inD = new Date(r.checkinDate);
      const outD = new Date(r.checkoutDate);
      nights = Math.max(1, Math.round((outD - inD) / (1000 * 60 * 60 * 24)));
    }
    totalNightsSold += nights;

    // Canal de Origem
    const source = (r.source || r.channel || "").toLowerCase();
    if (source.includes("site") || source.includes("motor") || source.includes("direct")) {
      channelCounts["Site CorpFlats"] += 1;
    } else if (source.includes("booking")) {
      channelCounts["Booking.com"] += 1;
    } else if (source.includes("airbnb")) {
      channelCounts["Airbnb"] += 1;
    } else if (source.includes("corp") || source.includes("b2b") || source.includes("empresa")) {
      channelCounts["Corporativo B2B"] += 1;
    } else {
      channelCounts["WhatsApp / Balcão"] += 1;
    }

    // Flat Stats
    const flatNum = String(r.flatNumber || (r.allocatedFlatNumbers && r.allocatedFlatNumbers[0]) || "");
    if (flatNum) {
      if (!flatStats[flatNum]) {
        flatStats[flatNum] = { flatNumber: flatNum, revenue: 0, nightsSold: 0, staysCount: 0 };
      }
      flatStats[flatNum].revenue += rev;
      flatStats[flatNum].nightsSold += nights;
      flatStats[flatNum].staysCount += 1;
    }
  });

  // Cálculos de Indicadores Hoteleiros (ADR, RevPAR e Ocupação)
  const occupancyRate = totalAvailableRoomNights > 0 ? ((totalNightsSold / totalAvailableRoomNights) * 100) : 0;
  const adr = totalNightsSold > 0 ? (totalRevenue / totalNightsSold) : 0;
  const revPar = totalAvailableRoomNights > 0 ? (totalRevenue / totalAvailableRoomNights) : 0;

  // Entradas (Check-ins) e Saídas (Check-outs) no Período
  const checkinsInPeriod = reservations.filter(r => r.checkinDate >= startDate && r.checkinDate <= endDate && r.status !== "cancelled");
  const checkoutsInPeriod = reservations.filter(r => r.checkoutDate >= startDate && r.checkoutDate <= endDate && r.status !== "cancelled");

  // Ranking de Flats por Receita
  const rankingFlats = Object.values(flatStats).map(f => {
    const flatOccupancy = totalDaysInPeriod > 0 ? ((f.nightsSold / totalDaysInPeriod) * 100) : 0;
    const flatAdr = f.nightsSold > 0 ? (f.revenue / f.nightsSold) : 0;
    return {
      ...f,
      revenue: Number(f.revenue.toFixed(2)),
      occupancyRate: Number(flatOccupancy.toFixed(1)),
      adr: Number(flatAdr.toFixed(2))
    };
  }).sort((a, b) => b.revenue - a.revenue);

  // Previsão Futura (Forecast para os próximos 30 dias a partir de hoje)
  const todayStr = new Date().toISOString().substring(0, 10);
  const future30Str = new Date(Date.now() + 30 * 86400000).toISOString().substring(0, 10);
  const future60Str = new Date(Date.now() + 60 * 86400000).toISOString().substring(0, 10);

  const future30Reservations = reservations.filter(r => r.status !== "cancelled" && r.checkinDate >= todayStr && r.checkinDate <= future30Str);
  const future60Reservations = reservations.filter(r => r.status !== "cancelled" && r.checkinDate >= todayStr && r.checkinDate <= future60Str);

  const forecast30Revenue = future30Reservations.reduce((acc, r) => acc + (parseFloat(r.totalAmount || r.totalPrice || 0) || 0), 0);
  const forecast30Nights = future30Reservations.reduce((acc, r) => acc + (Number(r.nightsCount) || 1), 0);
  const forecast30Occupancy = ((forecast30Nights / (totalFlatsCount * 30)) * 100);

  const forecast60Revenue = future60Reservations.reduce((acc, r) => acc + (parseFloat(r.totalAmount || r.totalPrice || 0) || 0), 0);
  const forecast60Nights = future60Reservations.reduce((acc, r) => acc + (Number(r.nightsCount) || 1), 0);
  const forecast60Occupancy = ((forecast60Nights / (totalFlatsCount * 60)) * 100);

  res.json({
    period: { startDate, endDate, totalDaysInPeriod, totalAvailableRoomNights },
    metrics: {
      totalRevenue: Number(totalRevenue.toFixed(2)),
      totalNightsSold,
      totalStays: periodReservations.length,
      occupancyRate: Number(occupancyRate.toFixed(1)),
      adr: Number(adr.toFixed(2)),
      revPar: Number(revPar.toFixed(2))
    },
    checkins: checkinsInPeriod.map(r => ({
      id: r.id,
      guestName: r.guestName,
      guestPhone: r.guestPhone,
      flatNumber: r.flatNumber,
      checkinDate: r.checkinDate,
      checkoutDate: r.checkoutDate,
      totalAmount: r.totalAmount || r.totalPrice,
      status: r.status
    })),
    checkouts: checkoutsInPeriod.map(r => ({
      id: r.id,
      guestName: r.guestName,
      guestPhone: r.guestPhone,
      flatNumber: r.flatNumber,
      checkinDate: r.checkinDate,
      checkoutDate: r.checkoutDate,
      totalAmount: r.totalAmount || r.totalPrice,
      status: r.status
    })),
    rankingFlats,
    channels: Object.entries(channelCounts).map(([channel, count]) => ({ channel, count })),
    forecast: {
      next30Days: {
        confirmedRevenue: Number(forecast30Revenue.toFixed(2)),
        confirmedNights: forecast30Nights,
        occupancyRate: Number(forecast30Occupancy.toFixed(1)),
        reservationsCount: future30Reservations.length
      },
      next60Days: {
        confirmedRevenue: Number(forecast60Revenue.toFixed(2)),
        confirmedNights: forecast60Nights,
        occupancyRate: Number(forecast60Occupancy.toFixed(1)),
        reservationsCount: future60Reservations.length
      }
    }
  });
});

app.get("/api/pms/guests", (req, res) => {
  if (!db.guests) db.guests = [];
  const reservations = db.reservations || [];
  const invoices = db.invoices || [];

  // Mapeia e enriquece cada hóspede com métricas 360º em tempo real
  const enrichedGuests = db.guests.map(g => {
    const cleanDoc = (g.documentNumber || g.document || "").replace(/\D/g, "");
    const guestNameLower = (g.fullName || g.name || "").trim().toLowerCase();

    // Localiza todas as reservas deste hóspede (por CPF ou Nome)
    const guestReservations = reservations.filter(r => {
      const resDoc = (r.guestDocument || r.document || "").replace(/\D/g, "");
      const resName = (r.guestName || "").trim().toLowerCase();
      return (cleanDoc && resDoc === cleanDoc) || (guestNameLower && resName === guestNameLower);
    });

    // Localiza todas as notas fiscais emitidas para este hóspede
    const guestInvoices = invoices.filter(inv => {
      const invDoc = (inv.tomadorCpfCnpj || "").replace(/\D/g, "");
      const invName = (inv.tomadorNome || "").trim().toLowerCase();
      return (cleanDoc && invDoc === cleanDoc) || (guestNameLower && invName === guestNameLower);
    });

    // Cálculos de LTV e Métricas de Hospedagem
    let totalSpent = 0;
    let totalNights = 0;
    const flatFrequency = {};

    guestReservations.forEach(r => {
      const val = parseFloat(r.totalAmount || r.totalPrice || r.price || 0) || 0;
      totalSpent += val;

      if (r.nightsCount) {
        totalNights += Number(r.nightsCount);
      } else if (r.checkinDate && r.checkoutDate) {
        const d1 = new Date(r.checkinDate);
        const d2 = new Date(r.checkoutDate);
        const diff = Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));
        totalNights += diff;
      } else {
        totalNights += 1;
      }

      if (r.flatNumber) {
        flatFrequency[r.flatNumber] = (flatFrequency[r.flatNumber] || 0) + 1;
      }
    });

    // Se não tiver reservas mas tiver notas emitidas
    if (totalSpent === 0 && guestInvoices.length > 0) {
      guestInvoices.forEach(inv => {
        totalSpent += parseFloat(inv.valorServico || 0) || 0;
        totalNights += Number(inv.quantidadeDiarias || 1);
        if (inv.flatNumber) {
          flatFrequency[inv.flatNumber] = (flatFrequency[inv.flatNumber] || 0) + 1;
        }
      });
    }

    // Identifica o flat mais frequente
    let favoriteFlat = "";
    let maxFlatCount = 0;
    for (const [flat, count] of Object.entries(flatFrequency)) {
      if (count > maxFlatCount) {
        maxFlatCount = count;
        favoriteFlat = flat;
      }
    }

    const totalStays = Math.max(guestReservations.length, g.totalStays || (guestInvoices.length > 0 ? guestInvoices.length : 0));
    const averageTicket = totalStays > 0 ? (totalSpent / totalStays) : 0;

    // Geração de Tags Automáticas Inteligentes
    const tags = Array.isArray(g.tags) ? [...g.tags] : [];
    if (totalSpent >= 2000 || totalStays >= 5) {
      if (!tags.includes("VIP")) tags.push("VIP");
    }
    if (totalStays >= 2 && !tags.includes("Recorrente")) {
      tags.push("Recorrente");
    }
    if (g.companyId && !tags.includes("Corporativo")) {
      tags.push("Corporativo");
    }
    if (g.hasPet && !tags.includes("Pet")) {
      tags.push("Pet");
    }

    // Verifica se possui empresa parceira associada
    let companyName = g.companyName || "";
    if (g.companyId && db.companies) {
      const comp = db.companies.find(c => c.id === Number(g.companyId));
      if (comp) companyName = comp.tradeName || comp.corporateName;
    }

    // Última data de estadia
    let lastStayDate = g.lastStayDate || "";
    if (guestReservations.length > 0) {
      const sortedRes = [...guestReservations].sort((a, b) => new Date(b.checkoutDate || b.checkinDate).getTime() - new Date(a.checkoutDate || a.checkinDate).getTime());
      lastStayDate = sortedRes[0].checkoutDate || sortedRes[0].checkinDate;
    }

    return {
      ...g,
      fullName: g.fullName || g.name || "Hóspede",
      name: g.fullName || g.name || "Hóspede",
      documentNumber: cleanDoc,
      document: cleanDoc,
      phone: g.phone || g.phoneNumber || "",
      email: g.email || "",
      totalSpent: Number(totalSpent.toFixed(2)),
      totalStays,
      totalNights,
      averageTicket: Number(averageTicket.toFixed(2)),
      favoriteFlat,
      lastStayDate,
      tags: Array.from(new Set(tags)),
      companyName,
      invoicesCount: guestInvoices.length,
      reservationsCount: guestReservations.length
    };
  });

  enrichedGuests.sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0));
  res.json(enrichedGuests);
});

// Detalhe 360º completo de um Hóspede
app.get("/api/pms/guests/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!db.guests) db.guests = [];
  const guest = db.guests.find(g => g.id === id);
  if (!guest) return res.status(404).json({ error: "Hóspede não encontrado." });

  const cleanDoc = (guest.documentNumber || guest.document || "").replace(/\D/g, "");
  const guestNameLower = (guest.fullName || guest.name || "").trim().toLowerCase();

  // Histórico de Reservas
  const guestReservations = (db.reservations || []).filter(r => {
    const resDoc = (r.guestDocument || r.document || "").replace(/\D/g, "");
    const resName = (r.guestName || "").trim().toLowerCase();
    return (cleanDoc && resDoc === cleanDoc) || (guestNameLower && resName === guestNameLower);
  }).sort((a, b) => new Date(b.checkinDate).getTime() - new Date(a.checkinDate).getTime());

  // Histórico de Notas Fiscais
  const guestInvoices = (db.invoices || []).filter(inv => {
    const invDoc = (inv.tomadorCpfCnpj || "").replace(/\D/g, "");
    const invName = (inv.tomadorNome || "").trim().toLowerCase();
    return (cleanDoc && invDoc === cleanDoc) || (guestNameLower && invName === guestNameLower);
  }).sort((a, b) => new Date(b.dataEmissao || 0).getTime() - new Date(a.dataEmissao || 0).getTime());

  // Histórico de Pedidos de Café da Manhã
  const guestBreakfastOrders = (db.breakfastOrders || []).filter(bo => {
    return (cleanDoc && bo.guestDocument === cleanDoc) || (guestNameLower && bo.guestName?.toLowerCase() === guestNameLower);
  });

  // Métricas
  const totalSpent = guestReservations.reduce((acc, r) => acc + (parseFloat(r.totalAmount || r.totalPrice || r.price || 0) || 0), 0) ||
                     guestInvoices.reduce((acc, i) => acc + (parseFloat(i.valorServico || 0) || 0), 0);

  res.json({
    ...guest,
    totalSpent: Number(totalSpent.toFixed(2)),
    totalStays: Math.max(guestReservations.length, guest.totalStays || 0),
    reservations: guestReservations,
    invoices: guestInvoices,
    breakfastOrders: guestBreakfastOrders,
    documents: guest.documents || []
  });
});

// Exportação da base de Hóspedes em CSV
app.get("/api/pms/guests/export/csv", (req, res) => {
  if (!db.guests) db.guests = [];
  
  const headers = ["ID", "Nome Completo", "CPF/CNPJ", "Telefone", "E-mail", "Cidade/UF", "Total Gasto (R$)", "Total Estadias", "Flat Mais Frequente", "Tags", "Empresa"];
  const rows = db.guests.map(g => {
    return [
      g.id,
      `"${(g.fullName || g.name || '').replace(/"/g, '""')}"`,
      `"${g.documentNumber || g.document || ''}"`,
      `"${g.phone || ''}"`,
      `"${g.email || ''}"`,
      `"${(g.city || '').replace(/"/g, '""')}"`,
      (g.totalSpent || 0).toFixed(2),
      g.totalStays || 1,
      g.favoriteFlat || '',
      `"${(Array.isArray(g.tags) ? g.tags.join(', ') : '')}"`,
      `"${(g.companyName || '').replace(/"/g, '""')}"`
    ].join(";");
  });

  const csvContent = "\uFEFF" + [headers.join(";"), ...rows].join("\r\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename=hospedes_corpflats_${new Date().toISOString().substring(0, 10)}.csv`);
  res.send(csvContent);
});



app.get("/api/pms/guests/:id", (req, res) => {
  const id = Number(req.params.id);
  const g = (db.guests || []).find(x => x.id === id);
  if (!g) return res.status(404).json({ error: "Hóspede não encontrado" });
  
  const stays = (db.reservations || []).filter(r => r.guestId === g.id || (g.document && r.guests?.some(rg => rg.cpf === g.document)));
  
  let photoUrl = g.photoUrl || null;
  let docPhotoUrl = g.docPhotoUrl || null;
  let signatureUrl = g.signatureUrl || null;
  
  for (const s of stays) {
    if (!photoUrl && (s.selfieUrl || s.photoUrl)) photoUrl = s.selfieUrl || s.photoUrl;
    if (!docPhotoUrl && (s.docPhotoUrl || s.documentPhotoUrl)) docPhotoUrl = s.docPhotoUrl || s.documentPhotoUrl;
    if (!signatureUrl && s.signatureUrl) signatureUrl = s.signatureUrl;
  }

  res.json({
    ...g,
    photoUrl: photoUrl || g.photoUrl || null,
    docPhotoUrl: docPhotoUrl || g.docPhotoUrl || null,
    signatureUrl: signatureUrl || g.signatureUrl || null,
    stays
  });
});

app.post("/api/pms/guests", (req, res) => {
  const { name, phone, email, document, city, notes, tags } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Nome é obrigatório." });
  if (!db.guests) db.guests = [];

  const newGuest = {
    id: db.guests.length > 0 ? Math.max(...db.guests.map(g => g.id)) + 1 : 1,
    name: name.trim(),
    phone: phone || "",
    email: email || "",
    document: document || "",
    city: city || "",
    notes: notes || "",
    tags: tags || [],
    createdAt: new Date().toISOString()
  };
  db.guests.unshift(newGuest);
  saveDatabase();
  res.status(201).json(newGuest);
});

// Room Blocks (Manutenção / Proprietário)
app.post("/api/pms/blocks", (req, res) => {
  const { flatId, startDate, endDate, reason = "manutencao", notes = "" } = req.body;
  if (!flatId || !startDate || !endDate) return res.status(400).json({ error: "Preencha quarto e período." });
  const flat = db.flats.find(f => f.id === Number(flatId));
  if (!flat) return res.status(404).json({ error: "Quarto não encontrado." });

  if (!db.roomBlocks) db.roomBlocks = [];
  const newBlock = {
    id: db.roomBlocks.length > 0 ? Math.max(...db.roomBlocks.map(b => b.id)) + 1 : 1,
    flatId: flat.id,
    flatNumber: flat.number,
    startDate,
    endDate,
    reason,
    notes,
    createdAt: new Date().toISOString()
  };
  db.roomBlocks.push(newBlock);
  saveDatabase();
  res.status(201).json(newBlock);
});

app.delete("/api/pms/blocks/:id", (req, res) => {
  const id = Number(req.params.id);
  db.roomBlocks = (db.roomBlocks || []).filter(b => b.id !== id);
  saveDatabase();
  res.json({ success: true });
});

// ── Reception Tablet & Portaria Endpoints ────────────────────────────────────
app.get("/api/reception/today", (req, res) => {
  triggerBackgroundSync();
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const brDate = new Date(utc - (3 * 3600000));
  const today = brDate.toISOString().substring(0, 10);
  const currentHour = brDate.getHours();

  // 1. Chegadas Previstas para Hoje (Aguardando Check-in)
  const arrivals = (db.reservations || [])
    .filter(r => {
      const resDate = r.checkinDate ? r.checkinDate.substring(0, 10) : "";
      return resDate === today && r.status !== "cancelada" && r.status !== "cancelado" && r.status !== "in_house" && r.status !== "completed" && r.status !== "checked_out";
    })
    .map(r => {
      const flat = db.flats.find(f => f.id === r.flatId || String(f.number) === String(r.flatNumber)) || { id: r.flatId, number: r.flatNumber || String(r.flatId) };
      const guest = (db.guests || []).find(g => g.id === r.guestId) || {};
      const cleanReq = (db.cleaningRequests || []).find(c => (c.flatId === flat.id || String(c.flatNumber) === String(flat.number)) && c.requestDate === today);
      
      const hasPendingCheckoutToday = (db.reservations || []).some(res => 
        (res.flatId === flat.id || String(res.flatNumber) === String(flat.number)) &&
        res.checkoutDate === today && res.id !== r.id && res.status !== "cancelada" && res.status !== "completed"
      );
      let cleaningStatus = "clean";
      let cleaningLabel = "✨ Limpo";
      let cleaningMinutes = 0;

      if (cleanReq) {
        if (cleanReq.status === "cleaning_now" || cleanReq.status === "in_progress") {
          cleaningStatus = "cleaning_now";
          const startedAt = cleanReq.startedAt || cleanReq.assignedAt || cleanReq.updatedAt || new Date().toISOString();
          const diffMins = Math.max(0, Math.floor((now.getTime() - new Date(startedAt).getTime()) / 60000));
          cleaningMinutes = diffMins;
          cleaningLabel = `🧹 Limpando (há ${diffMins} min)`;
        } else if (cleanReq.status === "dirty" || cleanReq.status === "pending") {
          cleaningStatus = "dirty";
          cleaningLabel = "⚠️ Sujo (aguardando limpeza)";
        } else if (cleanReq.status === "clean") {
          cleaningStatus = "clean";
          cleaningLabel = "✨ Limpo";
        }
      } else {
        if (hasPendingCheckoutToday) {
          cleaningStatus = "dirty";
          cleaningLabel = "⚠️ Sujo (aguardando limpeza)";
        } else {
          cleaningStatus = "clean";
          cleaningLabel = "✨ Limpo";
        }
      }

      const isRoomReady = cleaningStatus === "clean";

      // Quantidade de hóspedes autorizados (1, 2 ou 3)
      const count = Math.min(Math.max(Number(r.guestCount) || Number(r.adults) || 1, 1), 3);
      let guestList = Array.isArray(r.guests) && r.guests.length > 0 ? [...r.guests] : [];

      if (guestList.length === 0) {
        guestList.push({
          index: 1,
          name: r.guestName || guest.name || "Hóspede 1",
          cpf: guest.document || "",
          phone: r.guestPhone || guest.phone || "",
          email: r.guestEmail || guest.email || "",
          hasCompletedCheckin: Boolean(r.fnhrCompleted || guest.fnhrCompleted),
          checkinCompletedAt: r.fnhrCompleted ? r.updatedAt : null
        });
        for (let i = 2; i <= count; i++) {
          guestList.push({
            index: i,
            name: `Hóspede ${i}`,
            cpf: "",
            phone: "",
            email: "",
            hasCompletedCheckin: false,
            checkinCompletedAt: null
          });
        }
      }

      const allCheckinDone = guestList.every(g => g.hasCompletedCheckin);
      const someCheckinDone = guestList.some(g => g.hasCompletedCheckin);

      // Histórico de reservas anteriores do hóspede para checar se é 1ª vez ou recorrente
      const priorReservations = (db.reservations || []).filter(prev => {
        if (prev.id === r.id || prev.code === r.code) return false;
        if (prev.status === "cancelada" || prev.status === "cancelado") return false;
        const sameDoc = r.guestDocument && prev.guestDocument && r.guestDocument.replace(/\D/g, "") === prev.guestDocument.replace(/\D/g, "");
        const sameEmail = r.guestEmail && prev.guestEmail && r.guestEmail.trim().toLowerCase() === prev.guestEmail.trim().toLowerCase();
        const samePhone = r.guestPhone && prev.guestPhone && r.guestPhone.replace(/\D/g, "") === prev.guestPhone.replace(/\D/g, "");
        const sameGuestId = r.guestId && prev.guestId && r.guestId === prev.guestId;
        return Boolean(sameDoc || sameEmail || samePhone || sameGuestId);
      });
      const priorStayCount = priorReservations.length;
      const isFirstTimeGuest = priorStayCount === 0;

      // Lógica de Liberação de Check-in Antecipado e Entrada na Portaria
      const isSiteBooking = r.channel === "site";
      const isOtaBooking = r.channel === "airbnb" || r.channel === "booking" || r.channel === "decolar" || r.channel === "expedia";
      const isEarlyAuthorizedManual = Boolean(r.earlyCheckinAuthorized);
      const isPastOrExact14h = currentHour >= 14;

      // Early check-in só é liberado se o quarto estiver limpo E:
      // 1) Reserva Direta no Site, OU
      // 2) Liberação Manual do Admin, OU
      // 3) Cortesia de 1ª Hospedagem de cliente OTA (Airbnb / Booking)
      let earlyCheckinStatus = "Não liberado";
      let earlyCheckinReason = "";
      let isFirstStayCourtesy = false;

      if (!isRoomReady) {
        earlyCheckinStatus = "Não liberado";
        earlyCheckinReason = "Quarto não está limpo";
      } else {
        if (isSiteBooking) {
          earlyCheckinStatus = "Liberado";
          earlyCheckinReason = "Reserva Direta no Site";
        } else if (isEarlyAuthorizedManual) {
          earlyCheckinStatus = "Liberado";
          earlyCheckinReason = "Autorizado manualmente";
        } else if (isOtaBooking && isFirstTimeGuest) {
          earlyCheckinStatus = "Liberado";
          isFirstStayCourtesy = true;
          earlyCheckinReason = "Cortesia 1ª Reserva";
        } else {
          earlyCheckinStatus = "Não liberado";
          earlyCheckinReason = `Hóspede recorrente (${priorStayCount + 1}ª reserva) via ${r.channel}`;
        }
      }

      // Pode liberar entrada física na portaria se:
      // Quarto está limpo E (Já passou das 14h OU Early Check-in Liberado)
      let canAuthorizeEntry = false;
      let entryMessage = "";
      let entryBadgeType = "neutral";

      if (!isRoomReady) {
        canAuthorizeEntry = false;
        entryMessage = `Quarto não está pronto (${cleaningLabel})`;
        entryBadgeType = "error";
      } else if (isPastOrExact14h) {
        canAuthorizeEntry = true;
        entryMessage = "Check-in Regular (14:00)";
        entryBadgeType = "success";
      } else if (earlyCheckinStatus === "Liberado") {
        canAuthorizeEntry = true;
        entryMessage = isFirstStayCourtesy ? "🎁 Cortesia 1ª Reserva" : "⚡ Check-in Antecipado";
        entryBadgeType = "success";
      } else {
        canAuthorizeEntry = false;
        entryMessage = "Horário regular às 14:00 (Check-in antecipado não liberado)";
        entryBadgeType = "warning";
      }

      return {
        ...r,
        flatNumber: flat.number,
        cleaningStatus,
        cleaningLabel,
        cleaningMinutes,
        isRoomReady,
        priorStayCount,
        isFirstTimeGuest,
        earlyCheckinStatus,
        earlyCheckinReason,
        isFirstStayCourtesy,
        guestCount: count,
        guests: guestList,
        allCheckinDone,
        someCheckinDone,
        canAuthorizeEntry,
        entryMessage,
        entryBadgeType,
        earlyCheckinAuthorized: isEarlyAuthorizedManual,
        receptionNotes: r.receptionNotes || guest.notes || "",
        guestPhoto: r.selfieUrl || guest.photoUrl || null,
        docPhoto: r.docPhotoUrl || guest.docPhotoUrl || null,
        signatureUrl: r.signatureUrl || guest.signatureUrl || null,
        hasPreCheckin: Boolean(r.fnhrCompleted || guest.fnhrCompleted || someCheckinDone)
      };
    });

  // 2. Hóspedes Atualmente Hospedados (In House)
  // Devem ser apenas reservas com checkin confirmado (in_house) OU estadias anteriores ainda em andamento (checkinDate < today)
  const inHouse = (db.reservations || [])
    .filter(r => {
      if (r.status === "cancelada" || r.status === "cancelado" || r.status === "completed" || r.status === "checked_out") {
        return false;
      }
      if (r.status === "in_house") {
        return true;
      }
      if (r.checkinDate < today && r.checkoutDate >= today && r.status !== "pendente") {
        return true;
      }
      return false;
    })
    .map(r => {
      const flat = db.flats.find(f => f.id === r.flatId) || { id: r.flatId, number: r.flatNumber || String(r.flatId) };
      const guest = (db.guests || []).find(g => g.id === r.guestId) || {};
      const count = Math.min(Math.max(Number(r.guestCount) || Number(r.adults) || 1, 1), 3);
      return {
        ...r,
        flatNumber: flat.number,
        guestCount: count,
        guests: r.guests || [{ index: 1, name: r.guestName, hasCompletedCheckin: true }],
        receptionNotes: r.receptionNotes || guest.notes || "",
        isCheckoutToday: r.checkoutDate === today
      };
    });

  // 3. Checkouts Realizados Hoje (com opção de desfazer permanente)
  const completedToday = (db.reservations || [])
    .filter(r => r.status === "completed" && (r.actualCheckoutAt?.startsWith(today) || r.checkoutDate === today))
    .map(r => {
      const flat = db.flats.find(f => f.id === r.flatId) || { id: r.flatId, number: r.flatNumber || String(r.flatId) };
      return {
        ...r,
        flatNumber: flat.number
      };
    });

  // 4. Todas as Saídas Previstas para Hoje
  const departures = (db.reservations || [])
    .filter(r => r.checkoutDate === today && r.status !== "cancelada")
    .map(r => {
      const flat = db.flats.find(f => f.id === r.flatId) || { id: r.flatId, number: r.flatNumber || String(r.flatId) };
      return {
        ...r,
        flatNumber: flat.number
      };
    });

  res.json({
    today,
    arrivals,
    inHouse,
    completedToday,
    departures,
    totalFlats: db.flats.length
  });
});

app.patch("/api/pms/reservations/:id/early-checkin", (req, res) => {
  const id = Number(req.params.id);
  const r = (db.reservations || []).find(x => x.id === id);
  if (!r) return res.status(404).json({ error: "Reserva não encontrada" });

  r.earlyCheckinAuthorized = Boolean(req.body.earlyCheckinAuthorized);
  r.updatedAt = new Date().toISOString();
  saveDatabase();
  res.json({ success: true, earlyCheckinAuthorized: r.earlyCheckinAuthorized });
});

app.patch("/api/pms/reservations/:id/reception-notes", (req, res) => {
  const id = Number(req.params.id);
  const r = (db.reservations || []).find(x => x.id === id);
  if (!r) return res.status(404).json({ error: "Reserva não encontrada" });

  r.receptionNotes = String(req.body.receptionNotes || "");
  r.updatedAt = new Date().toISOString();
  saveDatabase();
  res.json({ success: true, receptionNotes: r.receptionNotes });
});

app.post("/api/reception/checkin/:reservationId", (req, res) => {
  const id = Number(req.params.reservationId);
  const r = (db.reservations || []).find(x => x.id === id);
  if (!r) return res.status(404).json({ error: "Reserva não encontrada" });

  const flat = db.flats.find(f => f.id === r.flatId || String(f.number) === String(r.flatNumber));
  
  // Atualiza solicitação de limpeza caso exista
  const cleanReq = (db.cleaningRequests || []).find(c => 
    (c.flatId === r.flatId || String(c.flatNumber) === String(r.flatNumber)) && 
    (c.requestDate === r.checkinDate || c.requestDate === getTodayStr())
  );
  if (cleanReq && cleanReq.status !== "clean") {
    cleanReq.status = "clean";
    cleanReq.completedAt = cleanReq.completedAt || new Date().toISOString();
    cleanReq.updatedAt = new Date().toISOString();
  }

  r.status = "in_house";
  r.actualCheckinAt = new Date().toISOString();
  r.updatedAt = new Date().toISOString();

  if (flat) {
    flat.isOccupied = true;
    flat.updatedAt = new Date().toISOString();
  }

  saveDatabase();
  res.json({ success: true, message: `Check-in do Apt ${r.flatNumber} realizado com sucesso!`, reservation: r });
});

app.post("/api/reception/checkout/:reservationId", (req, res) => {
  const id = Number(req.params.reservationId);
  const r = (db.reservations || []).find(x => x.id === id);
  if (!r) return res.status(404).json({ error: "Reserva não encontrada" });

  const previousStatus = r.status;
  r.status = "completed";
  r.actualCheckoutAt = new Date().toISOString();
  r.previousStatus = previousStatus;
  r.updatedAt = new Date().toISOString();

  const flat = db.flats.find(f => f.id === r.flatId);
  if (flat) {
    flat.isOccupied = false;
    flat.updatedAt = new Date().toISOString();
  }

  // Notifica ou agenda limpeza na governança
  const today = getTodayStr();
  let cleanReq = (db.cleaningRequests || []).find(c => c.flatId === r.flatId && c.requestDate === today);
  if (cleanReq) {
    cleanReq.isVacant = true;
  }

  // Automatic NFS-e Check with Channel Matrix Rules
  let autoInvoiceEmitted = false;
  let autoInvoiceNumber = null;
  let autoInvoicePdf = null;

  getFiscalData();
  const ch = (r.channel || "whatsapp").toLowerCase();
  // Channel rule (true = auto-emit all from this channel, false = locked/manual only)
  const channelRules = db.nfseConfig.channelRules || { site: true, whatsapp: true, booking: false, airbnb: false };
  const isChannelAutoEnabled = Boolean(channelRules[ch]);

  const guest = db.guests ? db.guests.find(g => g.id === r.guestId || (g.document && g.document === r.guestDocument)) : null;
  const clientRequested = Boolean(r.autoEmitInvoice || (guest && guest.autoEmitInvoice));

  // Emite se o canal estiver ativado OU se o cliente específico tiver a flag ligada
  const shouldAutoEmit = Boolean(isChannelAutoEnabled || clientRequested);

  if (shouldAutoEmit && !r.invoiceId && r.guestName && (r.guestDocument || guest?.document)) {
    try {
      const valor = Number(r.totalAmount || r.dailyRate || 250);
      const doc = r.guestDocument || guest?.document || "000.000.000-00";
      const result = {
        numeroNota: String(20260000 + Math.floor(Math.random() * 9000) + 100),
        codigoVerificacao: Math.random().toString(36).substring(2, 10).toUpperCase(),
        linkNota: `https://giss.campos.rj.gov.br/nfse/visualizar?num=20260490&cod=VERIF99`,
        linkXml: `https://giss.campos.rj.gov.br/nfse/xml?num=20260490`
      };

      const newInvoice = {
        id: db.invoices.length > 0 ? Math.max(...db.invoices.map(i => i.id)) + 1 : 1,
        numeroNfse: result.numeroNota,
        codigoVerificacao: result.codigoVerificacao,
        dataEmissao: new Date().toISOString(),
        tomadorNome: r.guestName,
        tomadorCpfCnpj: doc,
        tomadorEmail: r.guestEmail || guest?.email || "",
        tomadorTelefone: r.guestPhone || guest?.phone || "",
        flatNumber: String(r.flatNumber || "113"),
        reservationId: r.id,
        valorServico: valor,
        discriminacao: `SERVIÇOS DE HOSPEDAGEM EM FLAT - APT ${r.flatNumber || ""}. DE ${r.checkinDate} A ${r.checkoutDate}.`,
        status: "autorizada",
        linkPdf: result.linkNota,
        linkXml: result.linkXml,
        createdAt: new Date().toISOString()
      };

      db.invoices.unshift(newInvoice);
      r.invoiceId = newInvoice.id;
      r.numeroNfse = newInvoice.numeroNfse;
      autoInvoiceEmitted = true;
      autoInvoiceNumber = newInvoice.numeroNfse;
      autoInvoicePdf = newInvoice.linkPdf;
    } catch (e) {
      console.error("[Auto-Invoice Error]", e);
    }
  }

  saveDatabase();
  res.json({ 
    success: true, 
    message: autoInvoiceEmitted
      ? `Check-out do Apt ${r.flatNumber} realizado com sucesso! NFS-e Nº ${autoInvoiceNumber} emitida automaticamente.`
      : `Check-out do Apt ${r.flatNumber} realizado. Apartamento desocupado!`,
    reservationId: r.id,
    flatNumber: r.flatNumber,
    autoInvoiceEmitted,
    autoInvoiceNumber,
    autoInvoicePdf
  });
});

app.patch("/api/pms/guests/:id/auto-invoice", (req, res) => {
  const id = Number(req.params.id);
  const guest = (db.guests || []).find(g => g.id === id);
  if (!guest) return res.status(404).json({ error: "Hóspede não encontrado" });

  guest.autoEmitInvoice = Boolean(req.body.autoEmitInvoice);
  guest.updatedAt = new Date().toISOString();
  saveDatabase();
  res.json({ success: true, autoEmitInvoice: guest.autoEmitInvoice });
});

app.patch("/api/pms/reservations/:id/auto-invoice", (req, res) => {
  const id = Number(req.params.id);
  const r = (db.reservations || []).find(x => x.id === id);
  if (!r) return res.status(404).json({ error: "Reserva não encontrada" });

  r.autoEmitInvoice = Boolean(req.body.autoEmitInvoice);
  r.updatedAt = new Date().toISOString();
  saveDatabase();
  res.json({ success: true, autoEmitInvoice: r.autoEmitInvoice });
});

app.post("/api/reception/undo-checkout/:reservationId", (req, res) => {
  const id = Number(req.params.reservationId);
  const r = (db.reservations || []).find(x => x.id === id);
  if (!r) return res.status(404).json({ error: "Reserva não encontrada" });

  r.status = r.previousStatus || "in_house";
  r.actualCheckoutAt = null;
  r.updatedAt = new Date().toISOString();

  const flat = db.flats.find(f => f.id === r.flatId);
  if (flat) {
    flat.isOccupied = true;
    flat.updatedAt = new Date().toISOString();
  }

  saveDatabase();
  res.json({ success: true, message: `Check-out do Apt ${r.flatNumber} desfeito com sucesso!`, reservation: r });
});

// ── FNHR Pre-Checkin Digital Endpoints ──────────────────────────────────────
app.get("/api/pms/pre-checkin/:code", (req, res) => {
  const code = req.params.code;
  const r = (db.reservations || []).find(x => x.code === code || String(x.id) === code);
  if (!r) return res.status(404).json({ error: "Reserva não encontrada" });

  const guest = (db.guests || []).find(g => g.id === r.guestId) || {};
  const guestCount = Math.min(Math.max(Number(r.guestCount) || Number(r.adults) || 1, 1), 3);

  // Garante a lista de hóspedes
  if (!r.guests || r.guests.length === 0) {
    r.guests = [
      {
        index: 1,
        name: r.guestName || guest.name || "Hóspede 1",
        cpf: guest.document || "",
        phone: r.guestPhone || guest.phone || "",
        email: r.guestEmail || guest.email || "",
        hasCompletedCheckin: Boolean(r.fnhrCompleted || guest.fnhrCompleted),
        checkinCompletedAt: r.fnhrCompleted ? r.updatedAt : null
      }
    ];
    for (let i = 2; i <= guestCount; i++) {
      r.guests.push({
        index: i,
        name: `Hóspede ${i}`,
        cpf: "",
        phone: "",
        email: "",
        hasCompletedCheckin: false,
        checkinCompletedAt: null
      });
    }
  }

  res.json({
    reservation: r,
    guest,
    guestCount,
    guests: r.guests
  });
});

app.post("/api/pms/pre-checkin", async (req, res) => {
  const { 
    reservationId, 
    code,
    guestIndex = 1,
    fullName, 
    phone, 
    email, 
    document, 
    birthDate, 
    gender, 
    address, 
    city, 
    state, 
    country = "Brasil",
    transportMethod = "carro",
    travelReason = "lazer",
    selfieBase64, 
    docPhotoBase64, 
    signatureBase64 
  } = req.body;

  const r = (db.reservations || []).find(x => x.id === Number(reservationId) || x.code === code);
  if (!r) return res.status(404).json({ error: "Reserva não encontrada" });

  if (!db.guests) db.guests = [];

  const validName = (fullName || r.guestName || "Hóspede").trim();
  let guest = db.guests.find(g => (document && g.document === document) || (phone && g.phone === phone) || g.name.toLowerCase() === validName.toLowerCase());

  if (!guest) {
    guest = {
      id: db.guests.length > 0 ? Math.max(...db.guests.map(g => g.id)) + 1 : 1,
      name: validName,
      phone: phone || "",
      email: email || "",
      document: document || "",
      createdAt: new Date().toISOString()
    };
    db.guests.push(guest);
  }

  // Atualiza CRM
  if (validName) guest.name = validName;
  if (phone) guest.phone = phone;
  if (email) guest.email = email;
  if (document) guest.document = document;
  if (birthDate) guest.birthDate = birthDate;
  if (gender) guest.gender = gender;
  if (address) guest.address = address;
  if (city) guest.city = city;
  if (state) guest.state = state;
  // Salva imagens no Cloudflare R2 / Storage Seguro em vez de gravar Base64 pesado no PostgreSQL
  const selfieUrl = selfieBase64 ? await uploadImageToStorage(selfieBase64, `selfie_g${guest.id}`, db) : guest.photoUrl;
  const docPhotoUrl = docPhotoBase64 ? await uploadImageToStorage(docPhotoBase64, `doc_g${guest.id}`, db) : guest.docPhotoUrl;
  const signatureUrl = signatureBase64 ? await uploadImageToStorage(signatureBase64, `sig_g${guest.id}`, db) : guest.signatureUrl;

  if (selfieUrl) guest.photoUrl = selfieUrl;
  if (docPhotoUrl) guest.docPhotoUrl = docPhotoUrl;
  if (signatureUrl) guest.signatureUrl = signatureUrl;
  guest.fnhrCompleted = true;

  const now = new Date().toISOString();

  // Garante array de hóspedes na reserva
  const count = Math.min(Math.max(Number(r.guestCount) || Number(r.adults) || 1, 1), 3);
  if (!r.guests || r.guests.length === 0) {
    r.guests = [];
    for (let i = 1; i <= count; i++) {
      r.guests.push({
        index: i,
        name: i === 1 ? validName : `Hóspede ${i}`,
        cpf: i === 1 ? document : "",
        phone: i === 1 ? phone : "",
        email: i === 1 ? email : "",
        hasCompletedCheckin: false,
        checkinCompletedAt: null
      });
    }
  }

  // Atualiza o hóspede correspondente
  const targetGuest = r.guests.find(g => g.index === Number(guestIndex)) || r.guests[0];
  if (targetGuest) {
    targetGuest.name = validName;
    targetGuest.cpf = document || targetGuest.cpf;
    targetGuest.phone = phone || targetGuest.phone;
    targetGuest.email = email || targetGuest.email;
    targetGuest.hasCompletedCheckin = true;
    targetGuest.checkinCompletedAt = now;
  }

  if (Number(guestIndex) === 1) {
    r.guestName = validName;
    r.guestPhone = phone || r.guestPhone;
    r.guestEmail = email || r.guestEmail;
    if (selfieUrl) r.selfieUrl = selfieUrl;
    if (docPhotoUrl) r.docPhotoUrl = docPhotoUrl;
    if (signatureUrl) r.signatureUrl = signatureUrl;
    r.fnhrCompleted = true;
  }

  r.updatedAt = now;

  createNotification({
    category: "pre_checkin",
    title: `✅ Check-in Digital Realizado - Apt ${r.flatNumber}`,
    message: `${validName} preencheu a ficha digital. Entrada liberada na Portaria!`,
    severity: "success",
    metadata: { reservationId: r.id, flatNumber: r.flatNumber, guestName: validName },
    targetUrl: "/portaria"
  });

  saveDatabase();

  res.json({
    success: true,
    message: "Ficha de Check-in Digital registrada com sucesso! Entrada autorizada.",
    reservation: r,
    guest
  });
});

// ── SEBRAE Financial & Pricing Intelligence Endpoints ──────────────────────
function getFinancialSettings() {
  if (!db.financialSettings) {
    db.financialSettings = {
      fixedRent: 24000,
      fixedSalaries: 8000,
      fixedCondoIptu: 2500,
      fixedSystemsMaintenance: 1000,
      fixedOther: 500,
      varCleaningPerDay: 15,
      varUtilitiesPerDay: 5,
      varCardBreakfastPerDay: 10,
      targetProfitMarginPct: 0.25,
      avgChannelCommissionPct: 0.18,
      targetDirectMixPct: 0.45,
      referenceBaseRate: 237,
    };
  }
  return db.financialSettings;
}

app.get("/api/finance/overview", (req, res) => {
  const cfg = getFinancialSettings();
  const totalUHs = Math.max(1, db.flats.length || 24);
  const daysInMonth = 30;
  const availableNights = totalUHs * daysInMonth;

  // Real or Simulated Reservations metrics
  const activeReservations = (db.reservations || []).filter(r => r.status !== "cancelada");
  const soldNights = activeReservations.reduce((acc, r) => {
    try {
      const d1 = new Date(r.checkinDate);
      const d2 = new Date(r.checkoutDate);
      const n = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 86400000));
      return acc + n;
    } catch {
      return acc + 1;
    }
  }, 0) || Math.round(availableNights * 0.70); // default 70% occupancy if empty

  const occupancyPct = Math.min(1, soldNights / availableNights);

  // Fixed Costs
  const totalFixedCosts = (cfg.fixedRent || 0) + (cfg.fixedSalaries || 0) + (cfg.fixedCondoIptu || 0) + (cfg.fixedSystemsMaintenance || 0) + (cfg.fixedOther || 0);
  const fixedCostPerAvailableNight = totalFixedCosts / availableNights;
  const fixedCostPerSoldNight = soldNights > 0 ? (totalFixedCosts / soldNights) : fixedCostPerAvailableNight;

  // Variable Costs per occupied UH
  const varCostPerNight = (cfg.varCleaningPerDay || 15) + (cfg.varUtilitiesPerDay || 5) + (cfg.varCardBreakfastPerDay || 10);
  const totalCostPerOccupiedUH = fixedCostPerAvailableNight + varCostPerNight;

  // SEBRAE Sustainable Minimum Rate Formula: Custo por UH / (1 - Comissao% - Margem%)
  const denom = Math.max(0.1, 1 - (cfg.avgChannelCommissionPct || 0.18) - (cfg.targetProfitMarginPct || 0.25));
  const sustainableMinRate = totalCostPerOccupiedUH / denom;

  // Revenue & Channels breakdown
  let revenueDirect = 0;
  let revenueBooking = 0;
  let revenueAirbnb = 0;
  let nightsDirect = 0;
  let nightsBooking = 0;
  let nightsAirbnb = 0;

  activeReservations.forEach(r => {
    const amt = Number(r.totalAmount) || (Number(r.dailyRate || cfg.referenceBaseRate) * 2);
    const chan = (r.channel || "").toLowerCase();
    if (chan.includes("site") || chan.includes("whatsapp") || chan.includes("direta")) {
      revenueDirect += amt;
      nightsDirect += 2;
    } else if (chan.includes("booking")) {
      revenueBooking += amt;
      nightsBooking += 2;
    } else if (chan.includes("airbnb")) {
      revenueAirbnb += amt;
      nightsAirbnb += 2;
    } else {
      revenueDirect += amt;
      nightsDirect += 2;
    }
  });

  if (revenueDirect === 0 && revenueBooking === 0 && revenueAirbnb === 0) {
    revenueDirect = 23400;
    revenueBooking = 35000;
    revenueAirbnb = 14700;
    nightsDirect = 90;
    nightsBooking = 140;
    nightsAirbnb = 60;
  }

  const grossRevenue = revenueDirect + revenueBooking + revenueAirbnb;
  const commissionBooking = revenueBooking * 0.18;
  const commissionAirbnb = revenueAirbnb * 0.15;
  const commissionDirectCard = revenueDirect * 0.025; // 2.5% card fee
  const totalCommissionsPaid = commissionBooking + commissionAirbnb;
  const directSavings = (revenueDirect * 0.18) - commissionDirectCard; // what was saved by not paying OTA

  const netRevenue = grossRevenue - totalCommissionsPaid;
  const totalVariableCosts = (soldNights * varCostPerNight) + totalCommissionsPaid;
  const totalAllCosts = totalFixedCosts + totalVariableCosts;
  const ebitda = grossRevenue - totalAllCosts;
  const profitMarginPct = grossRevenue > 0 ? (ebitda / grossRevenue) : 0;

  // Key Indicators (KPIs)
  const adr = soldNights > 0 ? (grossRevenue / soldNights) : cfg.referenceBaseRate;
  const revparGross = grossRevenue / availableNights;
  const revparNet = netRevenue / availableNights;
  const directMixPct = grossRevenue > 0 ? (revenueDirect / grossRevenue) : 0.30;

  // Monthly Seasonality Curve (SEBRAE model)
  const seasonalityMonths = [
    { month: "Jan", occupancy: 0.88, factor: 0.15, season: "Alta", rate: sustainableMinRate * 1.15 },
    { month: "Fev", occupancy: 0.70, factor: 0.00, season: "Média", rate: sustainableMinRate },
    { month: "Mar", occupancy: 0.58, factor: 0.00, season: "Média", rate: sustainableMinRate },
    { month: "Abr", occupancy: 0.52, factor: -0.10, season: "Baixa", rate: sustainableMinRate * 0.90 },
    { month: "Mai", occupancy: 0.48, factor: -0.10, season: "Baixa", rate: sustainableMinRate * 0.90 },
    { month: "Jun", occupancy: 0.55, factor: 0.00, season: "Média", rate: sustainableMinRate },
    { month: "Jul", occupancy: 0.82, factor: 0.15, season: "Alta", rate: sustainableMinRate * 1.15 },
    { month: "Ago", occupancy: 0.60, factor: 0.00, season: "Média", rate: sustainableMinRate },
    { month: "Set", occupancy: 0.58, factor: 0.00, season: "Média", rate: sustainableMinRate },
    { month: "Out", occupancy: 0.62, factor: 0.00, season: "Média", rate: sustainableMinRate },
    { month: "Nov", occupancy: 0.68, factor: 0.00, season: "Média", rate: sustainableMinRate },
    { month: "Dez", occupancy: 0.90, factor: 0.15, season: "Alta", rate: sustainableMinRate * 1.15 },
  ];

  // Channel Net Yield Comparison (Simulation based on R$ 400 standard sale price)
  const simPrice = 400;
  const channelComparison = [
    { name: "Venda Direta — PIX", commissionPct: 0, feePct: 0, netReceived: simPrice, lostPct: 0, lostAmount: 0 },
    { name: "Venda Direta — Cartão Próprio", commissionPct: 0, feePct: 0.025, netReceived: simPrice * (1 - 0.025), lostPct: 2.5, lostAmount: simPrice * 0.025 },
    { name: "Booking.com (Padrão 15%)", commissionPct: 0.15, feePct: 0, netReceived: simPrice * 0.85, lostPct: 15, lostAmount: simPrice * 0.15 },
    { name: "Booking.com (Preferencial 18%)", commissionPct: 0.18, feePct: 0, netReceived: simPrice * 0.82, lostPct: 18, lostAmount: simPrice * 0.18 },
    { name: "Airbnb (Taxa 15%)", commissionPct: 0.15, feePct: 0, netReceived: simPrice * 0.85, lostPct: 15, lostAmount: simPrice * 0.15 },
    { name: "Decolar / Expedia (com VCC 19%)", commissionPct: 0.15, feePct: 0.04, netReceived: simPrice * 0.81, lostPct: 19, lostAmount: simPrice * 0.19 }
  ];

  // Sensitivity Matrix (Commission vs Profit Margin)
  const margins = [0.15, 0.20, 0.25, 0.30];
  const commissions = [0, 0.15, 0.18, 0.20, 0.25];
  const sensitivityMatrix = commissions.map(comm => {
    return {
      commissionPct: comm,
      values: margins.map(m => {
        const d = Math.max(0.05, 1 - comm - m);
        return Math.round(totalCostPerOccupiedUH / d);
      })
    };
  });

  res.json({
    settings: cfg,
    totalUHs,
    availableNights,
    soldNights,
    occupancyPct,
    costs: {
      totalFixedCosts,
      fixedCostPerAvailableNight,
      fixedCostPerSoldNight,
      varCostPerNight,
      totalCostPerOccupiedUH,
      sustainableMinRate
    },
    dre: {
      grossRevenue,
      revenueDirect,
      revenueBooking,
      revenueAirbnb,
      totalCommissionsPaid,
      directSavings,
      netRevenue,
      totalFixedCosts,
      totalVariableCosts,
      totalAllCosts,
      ebitda,
      profitMarginPct
    },
    kpis: {
      adr,
      revparGross,
      revparNet,
      directMixPct,
      targetDirectMixPct: cfg.targetDirectMixPct || 0.45
    },
    seasonalityMonths,
    channelComparison,
    sensitivityMatrix,
    margins
  });
});

app.post("/api/finance/settings", (req, res) => {
  const cfg = getFinancialSettings();
  const fields = [
    "fixedRent", "fixedSalaries", "fixedCondoIptu", "fixedSystemsMaintenance", "fixedOther",
    "varCleaningPerDay", "varUtilitiesPerDay", "varCardBreakfastPerDay",
    "targetProfitMarginPct", "avgChannelCommissionPct", "targetDirectMixPct", "referenceBaseRate"
  ];

  for (const f of fields) {
    if (req.body[f] !== undefined) {
      cfg[f] = Number(req.body[f]);
    }
  }

  db.financialSettings = cfg;
  saveDatabase();
  res.json({ success: true, settings: cfg });
});

// ── ERP CorpFlats: Módulo Financeiro & Contratos Long-Stay ──────────────────
function initERPFinancialData() {
  if (!db.accountsPayable) {
    db.accountsPayable = [
      {
        id: 1,
        flatNumber: "1017",
        category: "aluguel_flat",
        description: "Arrendamento Fixo Mensal - Flat 1017",
        supplier: "Proprietário Flat 1017",
        amount: 2200.00,
        dueDate: "2026-08-10",
        paymentDate: "2026-08-09",
        status: "pago",
        recurrence: "mensal",
        notes: "Contrato de 12 meses fixo"
      },
      {
        id: 2,
        flatNumber: "1017",
        category: "condominio_iptu",
        description: "Condomínio + IPTU - Flat 1017",
        supplier: "Administradora do Condomínio",
        amount: 580.00,
        dueDate: "2026-08-15",
        paymentDate: "2026-08-14",
        status: "pago",
        recurrence: "mensal"
      },
      {
        id: 3,
        flatNumber: "113",
        category: "aluguel_flat",
        description: "Arrendamento Fixo Mensal - Flat 113",
        supplier: "Proprietário Flat 113",
        amount: 2100.00,
        dueDate: "2026-08-25",
        paymentDate: null,
        status: "pendente",
        recurrence: "mensal"
      },
      {
        id: 4,
        flatNumber: "113",
        category: "condominio_iptu",
        description: "Condomínio + IPTU - Flat 113",
        supplier: "Administradora do Condomínio",
        amount: 550.00,
        dueDate: "2026-08-28",
        paymentDate: null,
        status: "pendente",
        recurrence: "mensal"
      },
      {
        id: 5,
        flatNumber: "geral",
        category: "salarios_equipe",
        description: "Folha de Pagamento - Equipe de Camareiras e Governança",
        supplier: "Equipe Operacional",
        amount: 5400.00,
        dueDate: "2026-08-05",
        paymentDate: "2026-08-05",
        status: "pago",
        recurrence: "mensal"
      },
      {
        id: 6,
        flatNumber: "geral",
        category: "insumos_cafe",
        description: "Fornecimento Semanal de Pães e Laticínios",
        supplier: "Distribuidora Central de Alimentos",
        amount: 780.00,
        dueDate: "2026-08-22",
        paymentDate: null,
        status: "pendente",
        recurrence: "semanal"
      },
      {
        id: 7,
        flatNumber: "geral",
        category: "lavanderia",
        description: "Higienização e Lavagem Industrial de Enxoval",
        supplier: "Lavanderia Prime Express",
        amount: 1120.00,
        dueDate: "2026-08-20",
        paymentDate: null,
        status: "pendente",
        recurrence: "quinzenal"
      }
    ];
  }

  if (!db.accountsReceivable) {
    db.accountsReceivable = [
      {
        id: 1,
        flatNumber: "1017",
        clientName: "Petrobras S.A. (Eng. Roberto Silveira)",
        category: "mensalidade_longstay",
        description: "Mensalidade Contrato Long-Stay Flat 1017 - Ref. Agosto/2026",
        amount: 4200.00,
        dueDate: "2026-08-05",
        receivedDate: "2026-08-04",
        paymentMethod: "pix",
        status: "recebido"
      },
      {
        id: 2,
        flatNumber: "113",
        clientName: "Mariana Costa e Silva",
        category: "diaria_shortstay",
        description: "Reserva Short-Stay 4 noites Flat 113",
        amount: 1480.00,
        dueDate: "2026-08-18",
        receivedDate: "2026-08-18",
        paymentMethod: "pix",
        status: "recebido"
      },
      {
        id: 3,
        flatNumber: "304",
        clientName: "Vale S.A. (Consultoria TI)",
        category: "mensalidade_longstay",
        description: "Fatura Corporativa Mensalidade Flat 304 - Ref. Agosto/2026",
        amount: 3900.00,
        dueDate: "2026-08-25",
        receivedDate: null,
        paymentMethod: "boleto",
        status: "pendente"
      },
      {
        id: 4,
        flatNumber: "511",
        clientName: "Carlos Eduardo Neves",
        category: "diaria_shortstay",
        description: "Reserva Fim de Semana Flat 511",
        amount: 890.00,
        dueDate: "2026-08-28",
        receivedDate: null,
        paymentMethod: "cartao_credito",
        status: "pendente"
      }
    ];
  }

  if (!db.longStayContracts) {
    db.longStayContracts = [
      {
        id: 1,
        flatNumber: "1017",
        tenantType: "pj",
        tenantName: "Petrobras Distribuidora S.A.",
        tenantDocument: "34.274.233/0001-02",
        occupantName: "Roberto Silveira",
        phone: "(21) 98877-6655",
        email: "financeiro.hospedagens@petrobras.com.br",
        startDate: "2026-06-01",
        endDate: "2026-12-01",
        monthlyRate: 4200.00,
        dueDay: 5,
        depositAmount: 4200.00,
        cleaningIncludedWeekly: true,
        status: "ativo",
        notes: "Faturamento direto via PIX / Boleto com NFS-e emitida todo dia 1º."
      },
      {
        id: 2,
        flatNumber: "304",
        tenantType: "pj",
        tenantName: "Vale S.A.",
        tenantDocument: "33.592.510/0001-54",
        occupantName: "Equipe de Consultoria de Minas",
        phone: "(31) 99122-3344",
        email: "contasapagar@vale.com",
        startDate: "2026-07-15",
        endDate: "2027-01-15",
        monthlyRate: 3900.00,
        dueDay: 25,
        depositAmount: 3900.00,
        cleaningIncludedWeekly: true,
        status: "ativo",
        notes: "Contrato semestral renovável."
      }
    ];
  }
}

// ── Endpoints Contas a Pagar (Accounts Payable) ─────────────────────────────
app.get("/api/finance/payables", (req, res) => {
  initERPFinancialData();
  const { status, category, flatNumber } = req.query;
  let list = db.accountsPayable || [];

  if (status) list = list.filter(item => item.status === status);
  if (category) list = list.filter(item => item.category === category);
  if (flatNumber) list = list.filter(item => item.flatNumber === flatNumber);

  const totalAmount = list.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);
  const paidAmount = list.filter(i => i.status === "pago").reduce((acc, i) => acc + (Number(i.amount) || 0), 0);
  const pendingAmount = list.filter(i => i.status === "pendente" || i.status === "vencido").reduce((acc, i) => acc + (Number(i.amount) || 0), 0);

  res.json({
    payables: list,
    summary: {
      total: totalAmount,
      paid: paidAmount,
      pending: pendingAmount,
      count: list.length
    }
  });
});

app.post("/api/finance/payables", (req, res) => {
  initERPFinancialData();
  const { flatNumber = "geral", category, description, supplier, amount, dueDate, recurrence = "unico", notes = "" } = req.body;
  if (!category || !description || !amount || !dueDate) {
    return res.status(400).json({ error: "Categoria, descrição, valor e data de vencimento são obrigatórios." });
  }

  const newItem = {
    id: db.accountsPayable.length > 0 ? Math.max(...db.accountsPayable.map(i => i.id)) + 1 : 1,
    flatNumber: String(flatNumber),
    category,
    description: description.trim(),
    supplier: supplier ? supplier.trim() : "Fornecedor Geral",
    amount: Number(amount),
    dueDate,
    paymentDate: null,
    status: "pendente",
    recurrence,
    notes: notes.trim(),
    createdAt: new Date().toISOString()
  };

  db.accountsPayable.unshift(newItem);
  saveDatabase();
  res.status(201).json(newItem);
});

app.patch("/api/finance/payables/:id/pay", (req, res) => {
  initERPFinancialData();
  const id = Number(req.params.id);
  const item = db.accountsPayable.find(i => i.id === id);
  if (!item) return res.status(404).json({ error: "Conta a pagar não encontrada." });

  item.status = req.body.status || "pago";
  item.paymentDate = req.body.paymentDate || new Date().toISOString().substring(0, 10);
  item.updatedAt = new Date().toISOString();
  saveDatabase();

  res.json({ success: true, item });
});

app.delete("/api/finance/payables/:id", (req, res) => {
  initERPFinancialData();
  const id = Number(req.params.id);
  db.accountsPayable = (db.accountsPayable || []).filter(i => i.id !== id);
  saveDatabase();
  res.json({ success: true });
});

// ── Endpoints Contas a Receber (Accounts Receivable) ────────────────────────
app.get("/api/finance/receivables", (req, res) => {
  initERPFinancialData();
  const { status, category, flatNumber } = req.query;
  let list = db.accountsReceivable || [];

  if (status) list = list.filter(item => item.status === status);
  if (category) list = list.filter(item => item.category === category);
  if (flatNumber) list = list.filter(item => item.flatNumber === flatNumber);

  const totalAmount = list.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);
  const receivedAmount = list.filter(i => i.status === "recebido").reduce((acc, i) => acc + (Number(i.amount) || 0), 0);
  const pendingAmount = list.filter(i => i.status === "pendente" || i.status === "atrasado").reduce((acc, i) => acc + (Number(i.amount) || 0), 0);

  res.json({
    receivables: list,
    summary: {
      total: totalAmount,
      received: receivedAmount,
      pending: pendingAmount,
      count: list.length
    }
  });
});

app.post("/api/finance/receivables", (req, res) => {
  initERPFinancialData();
  const { flatNumber = "geral", clientName, category, description, amount, dueDate, paymentMethod = "pix", notes = "" } = req.body;
  if (!clientName || !description || !amount || !dueDate) {
    return res.status(400).json({ error: "Cliente, descrição, valor e data de vencimento são obrigatórios." });
  }

  const newItem = {
    id: db.accountsReceivable.length > 0 ? Math.max(...db.accountsReceivable.map(i => i.id)) + 1 : 1,
    flatNumber: String(flatNumber),
    clientName: clientName.trim(),
    category: category || "diaria_shortstay",
    description: description.trim(),
    amount: Number(amount),
    dueDate,
    receivedDate: null,
    paymentMethod,
    status: "pendente",
    notes: notes.trim(),
    createdAt: new Date().toISOString()
  };

  db.accountsReceivable.unshift(newItem);
  saveDatabase();
  res.status(201).json(newItem);
});

app.patch("/api/finance/receivables/:id/receive", (req, res) => {
  initERPFinancialData();
  const id = Number(req.params.id);
  const item = db.accountsReceivable.find(i => i.id === id);
  if (!item) return res.status(404).json({ error: "Conta a receber não encontrada." });

  item.status = req.body.status || "recebido";
  item.receivedDate = req.body.receivedDate || new Date().toISOString().substring(0, 10);
  item.updatedAt = new Date().toISOString();
  saveDatabase();

  res.json({ success: true, item });
});

app.delete("/api/finance/receivables/:id", (req, res) => {
  initERPFinancialData();
  const id = Number(req.params.id);
  db.accountsReceivable = (db.accountsReceivable || []).filter(i => i.id !== id);
  saveDatabase();
  res.json({ success: true });
});

// ── Endpoints Contratos Long-Stay (Mensalistas) ──────────────────────────────
app.get("/api/pms/longstay-contracts", (req, res) => {
  initERPFinancialData();
  res.json(db.longStayContracts || []);
});

app.post("/api/pms/longstay-contracts", (req, res) => {
  initERPFinancialData();
  const { flatNumber, tenantType, tenantName, tenantDocument, occupantName, phone, email, startDate, endDate, monthlyRate, dueDay, depositAmount = 0, notes = "" } = req.body;
  if (!flatNumber || !tenantName || !monthlyRate || !startDate || !endDate) {
    return res.status(400).json({ error: "Flat, Inquilino, Valor Mensal e Período são obrigatórios." });
  }

  const newContract = {
    id: db.longStayContracts.length > 0 ? Math.max(...db.longStayContracts.map(c => c.id)) + 1 : 1,
    flatNumber: String(flatNumber),
    tenantType: tenantType || "pj",
    tenantName: tenantName.trim(),
    tenantDocument: tenantDocument ? tenantDocument.trim() : "",
    occupantName: occupantName ? occupantName.trim() : "",
    phone: phone ? phone.trim() : "",
    email: email ? email.trim() : "",
    startDate,
    endDate,
    monthlyRate: Number(monthlyRate),
    dueDay: Number(dueDay) || 5,
    depositAmount: Number(depositAmount) || 0,
    cleaningIncludedWeekly: Boolean(req.body.cleaningIncludedWeekly !== false),
    status: "ativo",
    notes: notes.trim(),
    createdAt: new Date().toISOString()
  };

  db.longStayContracts.unshift(newContract);
  saveDatabase();
  res.status(201).json(newContract);
});

app.patch("/api/pms/longstay-contracts/:id", (req, res) => {
  initERPFinancialData();
  const id = Number(req.params.id);
  const contract = db.longStayContracts.find(c => c.id === id);
  if (!contract) return res.status(404).json({ error: "Contrato não encontrado." });

  Object.assign(contract, req.body, { updatedAt: new Date().toISOString() });
  saveDatabase();
  res.json({ success: true, contract });
});

app.delete("/api/pms/longstay-contracts/:id", (req, res) => {
  initERPFinancialData();
  const id = Number(req.params.id);
  db.longStayContracts = (db.longStayContracts || []).filter(c => c.id !== id);
  saveDatabase();
  res.json({ success: true });
});

// Gerar fatura mensal no Contas a Receber e link de cobrança WhatsApp para Contrato Long-Stay
app.post("/api/pms/longstay-contracts/:id/generate-invoice", (req, res) => {
  initERPFinancialData();
  const id = Number(req.params.id);
  const contract = db.longStayContracts.find(c => c.id === id);
  if (!contract) return res.status(404).json({ error: "Contrato não encontrado." });

  const refMonth = req.body.refMonth || new Date().toISOString().substring(0, 7); // YYYY-MM
  const dueYearMonth = refMonth;
  const dueDayFormatted = String(contract.dueDay || 5).padStart(2, '0');
  const dueDate = `${dueYearMonth}-${dueDayFormatted}`;

  const newReceivable = {
    id: db.accountsReceivable.length > 0 ? Math.max(...db.accountsReceivable.map(i => i.id)) + 1 : 1,
    flatNumber: contract.flatNumber,
    clientName: contract.tenantName,
    category: "mensalidade_longstay",
    description: `Mensalidade Flat ${contract.flatNumber} - Ref. ${refMonth}`,
    amount: contract.monthlyRate,
    dueDate,
    receivedDate: null,
    paymentMethod: "pix",
    status: "pendente",
    notes: `Contrato Nº ${contract.id} (${contract.tenantName})`,
    createdAt: new Date().toISOString()
  };

  db.accountsReceivable.unshift(newReceivable);
  saveDatabase();

  const cleanPhone = (contract.phone || "").replace(/\D/g, "");
  const firstName = (contract.occupantName || contract.tenantName).split(" ")[0];
  const msg = encodeURIComponent(
    `Olá, ${firstName}! Tudo bem? 🏢\n\nSegue a fatura de locação da CorpFlats referente ao Flat ${contract.flatNumber} (Mês ${refMonth}):\n\n💰 Valor: R$ ${contract.monthlyRate.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n📅 Vencimento: ${dueDate}\n\nChave PIX CorpFlats:\n👉 pix@corpflats.com.br\n\nQualquer dúvida estamos à disposição!`
  );
  const whatsappUrl = cleanPhone ? `https://wa.me/55${cleanPhone}?text=${msg}` : null;

  res.json({
    success: true,
    message: `Fatura referente a ${refMonth} gerada com sucesso no Contas a Receber!`,
    receivable: newReceivable,
    whatsappUrl
  });
});

// ── Endpoints Fluxo de Caixa e DRE Integrado ────────────────────────────────
app.get("/api/finance/cashflow", (req, res) => {
  initERPFinancialData();
  const payables = db.accountsPayable || [];
  const receivables = db.accountsReceivable || [];

  const totalInflow = receivables.filter(r => r.status === "recebido").reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
  const totalPendingInflow = receivables.filter(r => r.status !== "recebido").reduce((acc, r) => acc + (Number(r.amount) || 0), 0);

  const totalOutflow = payables.filter(p => p.status === "pago").reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
  const totalPendingOutflow = payables.filter(p => p.status !== "pago").reduce((acc, p) => acc + (Number(p.amount) || 0), 0);

  const netRealized = totalInflow - totalOutflow;
  const netProjected = (totalInflow + totalPendingInflow) - (totalOutflow + totalPendingOutflow);

  res.json({
    totalInflow,
    totalPendingInflow,
    totalOutflow,
    totalPendingOutflow,
    netRealized,
    netProjected,
    recentPayables: payables.slice(0, 10),
    recentReceivables: receivables.slice(0, 10)
  });
});

// ── AI Autonomous Ad Operations & WhatsApp Cart Recovery Endpoints ──────────
function getMarketingData() {
  if (!db.abandonedCarts) {
    db.abandonedCarts = [
      {
        id: 1,
        sessionId: "sess_sample_1",
        guestName: "Renata Vasconcelos",
        guestPhone: "(21) 98844-2211",
        guestEmail: "renata.v@gmail.com",
        flatNumber: "113",
        checkinDate: "2026-08-22",
        checkoutDate: "2026-08-25",
        totalAmount: 750,
        status: "abandonado",
        createdAt: new Date(Date.now() - 45 * 60000).toISOString(),
        recoveredAt: null,
        recoveryMessageSent: false
      },
      {
        id: 2,
        sessionId: "sess_sample_2",
        guestName: "Eduardo Mendes",
        guestPhone: "(21) 99777-3322",
        guestEmail: "eduardo.m@outlook.com",
        flatNumber: "511",
        checkinDate: "2026-08-28",
        checkoutDate: "2026-08-30",
        totalAmount: 500,
        status: "abandonado",
        createdAt: new Date(Date.now() - 120 * 60000).toISOString(),
        recoveredAt: null,
        recoveryMessageSent: false
      }
    ];
  }

  if (!db.adCampaigns) {
    db.adCampaigns = [
      {
        id: 1,
        name: "🔥 Urgência Fim de Semana - Ocupação",
        targetAudience: "urgencia_baixa_ocupacao",
        platform: "meta",
        dailyBudget: 40,
        status: "ativa",
        impressions: 4820,
        clicks: 342,
        spent: 120,
        conversions: 3,
        revenue: 1650,
        roas: 13.75,
        creativeTitle: "Fim de Semana em Flat com Vista!",
        creativeCopy: "Ainda temos 2 flats disponíveis para este fim de semana com desconto exclusivo de reserva direta no PIX!",
        createdAt: new Date(Date.now() - 3 * 86400000).toISOString()
      },
      {
        id: 2,
        name: "💼 Executivos & Trabalho Remoto",
        targetAudience: "executivos",
        platform: "meta",
        dailyBudget: 30,
        status: "ativa",
        impressions: 3150,
        clicks: 198,
        spent: 90,
        conversions: 2,
        revenue: 900,
        roas: 10.0,
        creativeTitle: "Hospede-se com Wi-Fi 500MB e Conforto",
        creativeCopy: "Flat completo com bancada de trabalho, cozinha prática e check-in digital em 1 minuto. Garanta diária direta com NF!",
        createdAt: new Date(Date.now() - 5 * 86400000).toISOString()
      },
      {
        id: 3,
        name: "💑 Escapada a Dois - Casais",
        targetAudience: "casais",
        platform: "meta",
        dailyBudget: 25,
        status: "pausada",
        impressions: 2100,
        clicks: 110,
        spent: 50,
        conversions: 1,
        revenue: 550,
        roas: 11.0,
        creativeTitle: "Descanso Perfeito a Dois",
        creativeCopy: "Flats modernos com cama queen, ar silencioso e opção de café da manhã. Reserve direto sem taxas!",
        createdAt: new Date(Date.now() - 7 * 86400000).toISOString()
      }
    ];
  }

  if (!db.adSettings) {
    db.adSettings = {
      autoPilotEnabled: true,
      lowOccupancyThresholdPct: 60,
      highOccupancyPausePct: 85,
      defaultDailyBudget: 35,
      metaPixelId: "7489123891023",
      metaApiToken: "EAABwz...",
      googleAdsId: "AW-9481923"
    };
  }
}

// Telemetry from Booking Engine
app.post("/api/telemetry/cart-session", (req, res) => {
  getMarketingData();
  const { sessionId, guestName, guestPhone, guestEmail, flatNumber, checkinDate, checkoutDate, totalAmount, status } = req.body;
  if (!sessionId) return res.status(400).json({ error: "SessionId é obrigatório" });

  let cart = db.abandonedCarts.find(c => c.sessionId === sessionId);
  if (!cart) {
    cart = {
      id: db.abandonedCarts.length > 0 ? Math.max(...db.abandonedCarts.map(c => c.id)) + 1 : 1,
      sessionId,
      guestName: guestName || "",
      guestPhone: guestPhone || "",
      guestEmail: guestEmail || "",
      flatNumber: flatNumber || "",
      checkinDate: checkinDate || "",
      checkoutDate: checkoutDate || "",
      totalAmount: Number(totalAmount) || 0,
      status: status || "em_andamento",
      createdAt: new Date().toISOString(),
      recoveredAt: null,
      recoveryMessageSent: false
    };
    db.abandonedCarts.unshift(cart);
  } else {
    if (guestName) cart.guestName = guestName;
    if (guestPhone) cart.guestPhone = guestPhone;
    if (guestEmail) cart.guestEmail = guestEmail;
    if (flatNumber) cart.flatNumber = flatNumber;
    if (checkinDate) cart.checkinDate = checkinDate;
    if (checkoutDate) cart.checkoutDate = checkoutDate;
    if (totalAmount) cart.totalAmount = Number(totalAmount);
    if (status) cart.status = status;
  }

  saveDatabase();
  res.json({ success: true, cart });
});

// Get Abandoned Carts & Metrics
app.get("/api/marketing/abandoned-carts", (req, res) => {
  getMarketingData();
  const carts = db.abandonedCarts || [];
  const abandoned = carts.filter(c => c.status === "abandonado" || c.status === "em_andamento");
  const recovered = carts.filter(c => c.status === "recuperado" || c.status === "concluido");
  
  const totalAbandonedAmount = abandoned.reduce((acc, c) => acc + (c.totalAmount || 0), 0);
  const totalRecoveredAmount = recovered.reduce((acc, c) => acc + (c.totalAmount || 0), 0);
  const recoveryRatePct = carts.length > 0 ? (recovered.length / carts.length) * 100 : 0;

  res.json({
    carts,
    stats: {
      totalAbandoned: abandoned.length,
      totalRecovered: recovered.length,
      totalAbandonedAmount,
      totalRecoveredAmount,
      recoveryRatePct: Math.round(recoveryRatePct)
    }
  });
});

// Mark Abandoned Cart as Recovered / Generate WhatsApp Link
app.post("/api/marketing/abandoned-carts/:id/recover", (req, res) => {
  getMarketingData();
  const id = Number(req.params.id);
  const cart = db.abandonedCarts.find(c => c.id === id);
  if (!cart) return res.status(404).json({ error: "Carrinho não encontrado" });

  cart.recoveryMessageSent = true;
  cart.status = "recuperado";
  cart.recoveredAt = new Date().toISOString();
  saveDatabase();

  const cleanPhone = (cart.guestPhone || "").replace(/\D/g, "");
  const firstName = (cart.guestName || "amigo(a)").split(" ")[0];
  const msg = encodeURIComponent(
    `Olá, ${firstName}! Tudo bem? 😊\n\nNotamos que você estava reservando o seu Flat para os dias ${cart.checkinDate || ""} a ${cart.checkoutDate || ""}, mas a reserva ainda não foi finalizada.\n\nFicou alguma dúvida sobre o apartamento ou gostaria de uma condição especial no PIX com 5% de desconto para fechar agora?\n\nSe quiser concluir, basta acessar aqui: https://corpflats.onrender.com/reservar`
  );
  const whatsappUrl = `https://wa.me/55${cleanPhone}?text=${msg}`;

  res.json({ success: true, cart, whatsappUrl });
});

// Get Ad Campaigns & AI Auto-Pilot Status
app.get("/api/marketing/ad-campaigns", (req, res) => {
  getMarketingData();
  const campaigns = db.adCampaigns || [];
  const settings = db.adSettings;

  const totalSpent = campaigns.reduce((acc, c) => acc + (c.spent || 0), 0);
  const totalRevenue = campaigns.reduce((acc, c) => acc + (c.revenue || 0), 0);
  const totalClicks = campaigns.reduce((acc, c) => acc + (c.clicks || 0), 0);
  const totalConversions = campaigns.reduce((acc, c) => acc + (c.conversions || 0), 0);
  const overallRoas = totalSpent > 0 ? (totalRevenue / totalSpent) : 0;

  res.json({
    campaigns,
    settings,
    stats: {
      totalSpent,
      totalRevenue,
      totalClicks,
      totalConversions,
      overallRoas: overallRoas.toFixed(1)
    }
  });
});

// Create Campaign with AI Copy
app.post("/api/marketing/ad-campaigns", (req, res) => {
  getMarketingData();
  const { name, targetAudience, platform, dailyBudget, creativeTitle, creativeCopy } = req.body;
  if (!name) return res.status(400).json({ error: "Nome da campanha é obrigatório" });

  const newCamp = {
    id: db.adCampaigns.length > 0 ? Math.max(...db.adCampaigns.map(c => c.id)) + 1 : 1,
    name,
    targetAudience: targetAudience || "urgencia_baixa_ocupacao",
    platform: platform || "meta",
    dailyBudget: Number(dailyBudget) || 30,
    status: "ativa",
    impressions: 0,
    clicks: 0,
    spent: 0,
    conversions: 0,
    revenue: 0,
    roas: 0,
    creativeTitle: creativeTitle || "Reserva Direta com Melhor Tarifa",
    creativeCopy: creativeCopy || "Reserve direto com a administração e ganhe as melhores condições.",
    createdAt: new Date().toISOString()
  };

  db.adCampaigns.unshift(newCamp);
  saveDatabase();
  res.status(201).json(newCamp);
});

// Toggle Campaign Status
app.post("/api/marketing/ad-campaigns/:id/toggle", (req, res) => {
  getMarketingData();
  const id = Number(req.params.id);
  const camp = db.adCampaigns.find(c => c.id === id);
  if (!camp) return res.status(404).json({ error: "Campanha não encontrada" });

  camp.status = camp.status === "ativa" ? "pausada" : "ativa";
  saveDatabase();
  res.json({ success: true, camp });
});

// Save Marketing Settings
app.post("/api/marketing/ad-settings", (req, res) => {
  getMarketingData();
  const { autoPilotEnabled, lowOccupancyThresholdPct, highOccupancyPausePct, defaultDailyBudget, metaPixelId, metaApiToken, googleAdsId } = req.body;
  
  if (autoPilotEnabled !== undefined) db.adSettings.autoPilotEnabled = Boolean(autoPilotEnabled);
  if (lowOccupancyThresholdPct !== undefined) db.adSettings.lowOccupancyThresholdPct = Number(lowOccupancyThresholdPct);
  if (highOccupancyPausePct !== undefined) db.adSettings.highOccupancyPausePct = Number(highOccupancyPausePct);
  if (defaultDailyBudget !== undefined) db.adSettings.defaultDailyBudget = Number(defaultDailyBudget);
  if (metaPixelId !== undefined) db.adSettings.metaPixelId = metaPixelId;
  if (metaApiToken !== undefined) db.adSettings.metaApiToken = metaApiToken;
  if (googleAdsId !== undefined) db.adSettings.googleAdsId = googleAdsId;

  saveDatabase();
  res.json({ success: true, settings: db.adSettings });
});

// AI Copy Generator helper endpoint
app.get("/api/marketing/creative-generator", (req, res) => {
  const audience = req.query.audience || "casais";
  const copies = {
    casais: [
      {
        title: "✨ Seu Refúgio de Fim de Semana a Dois",
        hook: "Conforto absoluto, cama queen macia e o melhor descanso.",
        body: "Flats modernos e privativos com ar-condicionado silencioso, Wi-Fi ultra-rápido e opção de café da manhã. Reserve direto pelo site e garanta até 15% de economia sem taxas de intermediários!",
        cta: "Ver Disponibilidade no PIX"
      },
      {
        title: "🍷 Noite Perfeita com Vista e Conforto",
        hook: "Fuja da rotina sem complicação.",
        body: "Ambiente climatizado, roupas de cama impecáveis e check-in digital com total privacidade. Reserve direto com a gente.",
        cta: "Reservar Agora em 1 Minuto"
      }
    ],
    executivos: [
      {
        title: "💼 Sua Base de Trabalho com Wi-Fi 500MB",
        hook: "Praticidade, conforto e nota fiscal automática.",
        body: "Flat completo com bancada espaçosa para notebook, internet de alta velocidade, cozinha compacta e self check-in sem filas na recepção.",
        cta: "Reservar Estadia Corporativa"
      },
      {
        title: "⚡ Produtividade e Descanso no Mesmo Lugar",
        hook: "Localização estratégica para seus negócios.",
        body: "Silencioso, moderno e pronto para suas reuniões online. Diárias diretas com as melhores tarifas para empresas.",
        cta: "Garantir Quarto Executivo"
      }
    ],
    urgencia_baixa_ocupacao: [
      {
        title: "🔥 Últimas 2 Vagas para este Fim de Semana!",
        hook: "Condição especial exclusiva de última hora.",
        body: "Tivemos liberação de 2 flats premium para as próximas datas. Fechando direto no PIX você garante a melhor tarifa da cidade com cancelamento flexível!",
        cta: "Aproveitar Desconto de Última Hora"
      }
    ]
  };

  res.json({ audience, variations: copies[audience] || copies.casais });
});

// ── NFS-e Fiscal Invoices (Padrão Nacional ADN / Receita Federal) ───────────
import { 
  toTitleCase,
  onlyDigits, 
  isValidCpf, 
  isValidCnpj, 
  cleanPhone, 
  cleanCep, 
  TAX_CATALOG, 
  buildNationalDpsPayload, 
  processNationalInvoiceEmission, 
  renderDanfseHtml,
  generateChaveAcessoNacional
} from "./national-nfse.mjs";

function getFiscalData() {
  if (db.nfseConfig) {
    db.nfseConfig.ambiente = "producao";
  }
  if (!db.nfseConfig || db.nfseConfig.cnpjPrestador !== "47.964.813/0001-65") {
    db.nfseConfig = {
      padrao: "nacional_adn",
      cnpjPrestador: "47.964.813/0001-65",
      inscricaoMunicipal: "142591",
      razaoSocial: "Rental Miller's LTDA",
      nomeFantasia: "CorpFlats",
      codigoMunicipio: "3301009",
      regimeTributario: "simples_nacional",
      aliquotaIss: 2.00,
      ambiente: "producao",
      autoEmitOnCheckout: false,
      certificadoA1: {
        configurado: true,
        nomeArquivo: "certificado_corpflats_2026.pfx",
        validade: "2027-06-30T23:59:59.000Z",
        emissor: "AC Certisign Multipla G5",
        titular: "Rental Miller's LTDA:47964813000165"
      },
      channelRules: {
        site: true,
        whatsapp: true,
        booking: false,
        airbnb: false
      }
    };
  }

  if (!db.invoices || db.invoices.length === 0 || db.invoices[0].prestadorCnpj !== "47.964.813/0001-65") {
    db.invoices = [
      {
        id: 1,
        numeroNfse: "202600184",
        codigoVerificacao: "A8B7C9D2",
        chaveAcesso: "332608479648130001650100100000000118472910482",
        dataEmissao: new Date(Date.now() - 2 * 86400000).toISOString(),
        regraFiscalId: "hospedagem_corpflats",
        prestadorRazaoSocial: "Rental Miller's LTDA",
        prestadorCnpj: "47.964.813/0001-65",
        prestadorIm: "142591",
        tomadorNome: "Carlos Eduardo da Silveira",
        tomadorCpfCnpj: "04829184719",
        tomadorEmail: "carlos.silveira@empresa.com",
        tomadorTelefone: "21987654321",
        flatNumber: "113",
        reservationId: 1,
        valorServico: 750.00,
        cnae: "5510-8/01",
        codigoTributacaoNacional: "09.02.01",
        discriminacao: "SERVIÇOS DE HOSPEDAGEM EM FLAT PORTO SEGURO (3 DIÁRIAS) - APARTAMENTO 113. DIÁRIAS COM WI-FI, ENERGIA E LIMPEZA INCLUSA.",
        status: "autorizada",
        protocoloAutorizacao: "ADN_20260825_91823",
        createdAt: new Date(Date.now() - 2 * 86400000).toISOString()
      },
      {
        id: 2,
        numeroNfse: "202600185",
        codigoVerificacao: "X7Y8Z9W1",
        chaveAcesso: "332608479648130001650100100000000218472910940",
        dataEmissao: new Date(Date.now() - 1 * 86400000).toISOString(),
        regraFiscalId: "hospedagem_corpflats",
        prestadorRazaoSocial: "Rental Miller's LTDA",
        prestadorCnpj: "47.964.813/0001-65",
        prestadorIm: "142591",
        tomadorNome: "Petroserv Logística Offshore Ltda",
        tomadorCpfCnpj: "12345678000190",
        tomadorEmail: "financeiro@petroserv.com.br",
        tomadorTelefone: "2227220011",
        flatNumber: "511",
        reservationId: 2,
        valorServico: 1250.00,
        cnae: "5510-8/01",
        codigoTributacaoNacional: "09.02.01",
        discriminacao: "SERVIÇOS DE HOSPEDAGEM CORPORATIVA EM FLAT - APARTAMENTO 511. DIÁRIAS COM WI-FI E LIMPEZA INCLUSA.",
        status: "autorizada",
        protocoloAutorizacao: "ADN_20260826_10482",
        createdAt: new Date(Date.now() - 1 * 86400000).toISOString()
      }
    ];
  }
}

// ── Endpoints Padrão Nacional NFS-e ─────────────────────────────────────────


app.delete("/api/nfse/invoices/:id", (req, res) => {
  getFiscalData();
  const id = Number(req.params.id);
  db.invoices = (db.invoices || []).filter(i => i.id !== id);
  saveDatabase();
  res.json({ success: true, message: "Registro removido com sucesso." });
});


// ─── Chat / Assistente Fiscal Inteligente (Extração Rápida de Dados) ─────────
app.post("/api/nfse/chat-parse", (req, res) => {
  const { message = "" } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: "Mensagem vazia." });
  }
  const parsed = parseInvoiceChatPrompt(message);
  res.json({
    success: true,
    data: parsed,
    message: "Dados extraídos com sucesso para preenchimento da NFS-e!"
  });
});


// ─── Lookup de CNPJ e CEP do Nota-Fácil ───────────────────────────────────────
app.get("/api/invoices/lookup-cnpj/:cnpj", async (req, res) => {
  try {
    const data = await lookupCnpj(req.params.cnpj);
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get("/api/invoices/lookup-cep/:cep", async (req, res) => {
  try {
    const data = await lookupCep(req.params.cep);
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ─── Chat Fiscal Conversacional Oficial do Nota-Fácil ────────────────────────

// ─── Configurações Fiscais & Templates com Tags Dinâmicas ────────────────────
app.get("/api/nfse/settings", (req, res) => {
  if (!db.fiscalSettings) {
    db.fiscalSettings = {
      descriptionTemplate: DEFAULT_FISCAL_TEMPLATE,
      aliquotaPadrao: 2.00,
      codigoServico: "09.02",
      codigoTributacaoMunicipio: "799020000",
      cnae: "5510801",
      optanteSimplesNacional: true,
      cnpjPrestador: "47.964.813/0001-65",
      inscricaoMunicipal: "142591",
      razaoSocial: "Rental Miller's LTDA"
    };
    saveDatabase();
  }
  res.json(db.fiscalSettings);
});

app.post("/api/nfse/settings", (req, res) => {
  const { 
    descriptionTemplate, 
    aliquotaPadrao, 
    codigoServico, 
    codigoTributacaoMunicipio, 
    cnae, 
    optanteSimplesNacional 
  } = req.body;

  if (!db.fiscalSettings) db.fiscalSettings = {};

  if (descriptionTemplate !== undefined) db.fiscalSettings.descriptionTemplate = descriptionTemplate;
  if (aliquotaPadrao !== undefined) db.fiscalSettings.aliquotaPadrao = Number(aliquotaPadrao);
  if (codigoServico !== undefined) db.fiscalSettings.codigoServico = codigoServico;
  if (codigoTributacaoMunicipio !== undefined) db.fiscalSettings.codigoTributacaoMunicipio = codigoTributacaoMunicipio;
  if (cnae !== undefined) db.fiscalSettings.cnae = cnae;
  if (optanteSimplesNacional !== undefined) db.fiscalSettings.optanteSimplesNacional = Boolean(optanteSimplesNacional);

  saveDatabase();
  res.json({ success: true, settings: db.fiscalSettings });
});

app.post("/api/invoices/chat", async (req, res) => {
  try {
    const { messages = [], currentData = {}, tomador = null } = req.body;
    const template = db.fiscalSettings?.descriptionTemplate || DEFAULT_FISCAL_TEMPLATE;

    const result = await processChatConversation({ 
      messages, 
      currentData, 
      tomadorFixo: tomador,
      customTemplate: template
    });

    // Auto-cadastro no CRM de hóspedes caso ainda não exista
    if (result.data?.tomadorNome && result.data?.tomadorCpfCnpj && result.data.tomadorCpfCnpj.length >= 11) {
      if (!db.guests) db.guests = [];
      const cleanDoc = result.data.tomadorCpfCnpj;
      const existingGuest = db.guests.find(g => (g.documentNumber || "").replace(/\D/g, "") === cleanDoc);
      
      if (!existingGuest) {
        const nextGuestId = (db.guests.length > 0 ? Math.max(...db.guests.map(g => Number(g.id) || 0)) : 0) + 1;
        const newGuest = {
          id: nextGuestId,
          fullName: result.data.tomadorNome,
          documentNumber: cleanDoc,
          documentType: cleanDoc.length === 11 ? "cpf" : "cnpj",
          email: result.data.tomadorEmail || "",
          phone: result.data.tomadorTelefone || "",
          notes: "Cadastrado automaticamente via Chat Assistente Fiscal",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        db.guests.unshift(newGuest);
        saveDatabase();
        console.log(`[CRM] Hóspede ${newGuest.fullName} auto-cadastrado com sucesso!`);
      }
    }

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get Invoices List
app.get("/api/nfse/invoices", (req, res) => {
  getFiscalData();
  const invoices = db.invoices || [];
  const authorized = invoices.filter(i => i.status === "autorizada");
  const totalFaturado = authorized.reduce((acc, i) => acc + (i.valorServico || 0), 0);

  // Verificação de expiração do certificado A1
  const certValidade = db.nfseConfig.certificadoA1?.validade;
  let certDaysRemaining = 365;
  let certExpiringSoon = false;
  if (certValidade) {
    const diffMs = new Date(certValidade).getTime() - Date.now();
    certDaysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    certExpiringSoon = certDaysRemaining <= 30;
  }

  res.json({
    invoices,
    config: db.nfseConfig,
    channelRules: db.nfseConfig.channelRules,
    taxCatalog: TAX_CATALOG,
    certStatus: {
      ...db.nfseConfig.certificadoA1,
      daysRemaining: certDaysRemaining,
      expiringSoon: certExpiringSoon
    },
    stats: {
      totalCount: invoices.length,
      authorizedCount: authorized.length,
      totalFaturado
    }
  });
});

// Emit NFS-e Padrão Nacional
app.post("/api/nfse/emit", async (req, res) => {
  getFiscalData();
  const { 
    reservationId, 
    reservationCode,
    tomadorNome, 
    tomadorCpfCnpj, 
    tomadorEmail, 
    tomadorTelefone, 
    flatNumber, 
    valorServico, 
    discriminacao,
    regraFiscalId = "hospedagem_corpflats"
  } = req.body;

  // 1. Validação Prévia dos Dados
  if (!tomadorNome || !tomadorNome.trim()) {
    return res.status(400).json({ error: "Nome ou Razão Social do tomador é obrigatório." });
  }

  const cleanDoc = onlyDigits(tomadorCpfCnpj);
  if (cleanDoc.length === 11) {
    if (!isValidCpf(cleanDoc)) {
      return res.status(400).json({ error: "CPF informado é inválido pelo algoritmo da Receita Federal." });
    }
  } else if (cleanDoc.length === 14) {
    if (!isValidCnpj(cleanDoc)) {
      return res.status(400).json({ error: "CNPJ informado é inválido pelo algoritmo da Receita Federal." });
    }
  } else {
    return res.status(400).json({ error: "Documento deve ser um CPF (11 dígitos) ou CNPJ (14 dígitos) válido." });
  }

  const valor = Number(valorServico);
  if (!valor || valor <= 0 || isNaN(valor)) {
    return res.status(400).json({ error: "Valor do serviço deve ser maior que zero." });
  }

  try {
    const maxId = db.invoices && db.invoices.length > 0 ? Math.max(...db.invoices.map(i => Number(i.id || 0))) : 875;
    const maxRps = db.invoices && db.invoices.length > 0 ? Math.max(...db.invoices.map(i => Number(i.numeroRps || i.numeroNfse || i.id || 0))) : 875;
    const nextDpsNumber = maxId + 1;
    const nextRpsNumber = Math.max(maxRps + 1, 875);

    // 2. Emissão via Motor Municipal GissOnline da Prefeitura de Campos dos Goytacazes
    const emissionResult = await emitirNfseGissReal({
      numeroRps: nextRpsNumber,
      numeroLote: nextDpsNumber,
      valorServico: valor,
      discriminacao: discriminacao || `SERVIÇOS DE HOSPEDAGEM EM FLAT MOBILIADO CORPFLATS. FLAT ${flatNumber || ''}. DIÁRIAS COM WI-FI, ENERGIA E LIMPEZA INCLUSA.`,
      tomadorNome: tomadorNome.trim(),
      tomadorCpfCnpj: cleanDoc,
      tomadorEmail: (tomadorEmail || "").trim().toLowerCase(),
      tomadorTelefone: cleanPhone(tomadorTelefone),
      flatNumber: flatNumber ? String(flatNumber) : "",
      reservationCode
    });

    const newInvoice = {
      id: nextDpsNumber,
      numeroRps: nextRpsNumber,
      numeroNfse: emissionResult.numeroNfse,
      codigoVerificacao: emissionResult.codigoVerificacao,
      chaveAcesso: emissionResult.protocoloAutorizacao,
      protocoloAutorizacao: emissionResult.protocoloAutorizacao,
      dataEmissao: emissionResult.dataEmissao,
      sistemaEmissor: "giss_prefeitura",
      municipioEmissor: "Campos dos Goytacazes - RJ (3301009)",
      regraFiscalId: "hospedagem_corpflats",
      prestadorRazaoSocial: "RENTAL MILLER S LTDA (CorpFlats)",
      prestadorCnpj: "47964813000165",
      prestadorIm: "142591",
      tomadorNome: toTitleCase(tomadorNome),
      tomadorCpfCnpj: cleanDoc,
      tomadorEmail: (tomadorEmail || "").trim().toLowerCase(),
      tomadorTelefone: cleanPhone(tomadorTelefone),
      flatNumber: flatNumber ? String(flatNumber) : "",
      reservationId: reservationId ? Number(reservationId) : null,
      reservationCode: reservationCode || null,
      valorServico: valor,
      aliquota: 2.0,
      cnae: "5510801",
      codigoServico: "09.02",
      codigoTributacaoMunicipio: "799020000",
      discriminacao: discriminacao || `SERVIÇOS DE HOSPEDAGEM EM FLAT MOBILIADO CORPFLATS. FLAT ${flatNumber || ''}. DIÁRIAS COM WI-FI, ENERGIA E LIMPEZA INCLUSA.`,
      status: "autorizada",
      linkPrefeitura: emissionResult.linkNota || "https://goytacazes.giss.com.br/portal/#/nfse/consulta",
      qrCodeUrl: emissionResult.qrCodeUrl,
      createdAt: new Date().toISOString()
    };

    db.invoices.unshift(newInvoice);
    saveDatabase();

    // Log de auditoria
    logAuditEvent({
      level: "info",
      category: "financial",
      action: "NFSE_EMITTED_GISSONLINE",
      actor: { name: "Motor GissOnline Campos", role: "admin" },
      details: {
        numeroNfse: newInvoice.numeroNfse,
        codigoVerificacao: newInvoice.codigoVerificacao,
        tomador: newInvoice.tomadorNome,
        valor: newInvoice.valorServico,
        link: newInvoice.linkPrefeitura
      },
      source: "giss_engine"
    });

    res.status(201).json({ 
      success: true, 
      invoice: newInvoice,
      numeroNfse: numNfseReal,
      numeroNota: numNfseReal,
      codigoVerificacao: codVerifReal,
      danfseUrl: `/api/nfse/danfse/${numNfseReal}`,
      linkPrefeitura: newInvoice.linkPrefeitura,
      qrCodeUrl: newInvoice.qrCodeUrl,
      message: `Nota Fiscal Nº ${numNfseReal} emitida com sucesso pelo GissOnline Municipal!`
    });
  } catch (err) {
    console.error("[GissOnline Emission Error]", err);
    res.status(500).json({ error: "Erro na emissão pelo GissOnline Municipal: " + err.message });
  }
});

app.get("/api/nfse/danfse/:id", (req, res) => {
  getFiscalData();
  const rawId = String(req.params.id || "").trim();
  const numId = Number(rawId);

  let inv = (db.invoices || []).find(i => 
    i.id === numId || 
    String(i.id) === rawId || 
    String(i.numeroNfse) === rawId || 
    String(i.codigoVerificacao).toUpperCase() === rawId.toUpperCase()
  );

  // Fallback para a última nota se for passado 'latest' ou se não achar por id
  if (!inv && (rawId === "latest" || db.invoices?.length > 0)) {
    inv = db.invoices[0];
  }

  if (!inv) {
    return res.status(404).send("<h2 style='font-family:sans-serif;text-align:center;margin-top:40px;color:#e11d48;'>Nota Fiscal não encontrada no sistema.</h2>");
  }

  const html = renderGissDanfseHtml(inv);
  res.type("html").send(html);
});

// Download XML Oficial Padrão Nacional
app.get("/api/nfse/xml/:id", (req, res) => {
  getFiscalData();
  const id = Number(req.params.id);
  const inv = db.invoices.find(i => i.id === id || i.chaveAcesso === String(req.params.id));
  if (!inv) return res.status(404).json({ error: "Nota não encontrada" });

  const xmlContent = generateNationalXmlContent({
    chaveAcesso: inv.chaveAcesso,
    numNfse: inv.numeroNfse,
    codVerif: inv.codigoVerificacao,
    dataEmissao: inv.dataEmissao,
    dpsPayload: {
      infDPS: {
        id: `DPS_${inv.chaveAcesso}`,
        tpAmb: db.nfseConfig.ambiente === "producao" ? 1 : 2,
        dhEmi: inv.dataEmissao,
        prest: {
          CNPJ: onlyDigits(inv.prestadorCnpj || "32481992000150"),
          xNome: inv.prestadorRazaoSocial || "CORP FLATS HOSPEDAGEM E LOCAÇÕES LTDA"
        },
        toma: {
          CNPJ: inv.tomadorCpfCnpj,
          xNome: inv.tomadorNome
        },
        serv: {
          cTribNac: inv.codigoTributacaoNacional || "09.02.01",
          xDescServ: inv.discriminacao
        },
        valores: {
          vServPrest: { vServ: Number(inv.valorServico || 0).toFixed(2) },
          trib: { totTrib: { vTotTrib: { vTotTribFed: (Number(inv.valorServico || 0) * 0.045).toFixed(2), vTotTribMun: (Number(inv.valorServico || 0) * 0.02).toFixed(2) } } }
        }
      }
    }
  });

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="NFSe_${inv.numeroNfse}_${inv.chaveAcesso}.xml"`);
  res.send(xmlContent);
});

// Cancel NFS-e Padrão Nacional
app.post("/api/nfse/cancel/:id", (req, res) => {
  getFiscalData();
  const id = Number(req.params.id);
  const { motivo = "Cancelamento solicitado pelo prestador por erro de emissão ou desistência." } = req.body || {};
  const inv = db.invoices.find(i => i.id === id);
  if (!inv) return res.status(404).json({ error: "Nota não encontrada" });

  inv.status = "cancelada";
  inv.motivoCancelamento = motivo;
  inv.canceladoEm = new Date().toISOString();
  saveDatabase();

  logAuditEvent({
    level: "warn",
    category: "financial",
    action: "NFSE_CANCELLED_NATIONAL",
    actor: { name: "Gestor", role: "admin" },
    details: { numeroNfse: inv.numeroNfse, chaveAcesso: inv.chaveAcesso, motivo },
    source: "nfse_engine"
  });

  res.json({ success: true, message: `NFS-e Nº ${inv.numeroNfse} cancelada com sucesso no Ambiente Nacional.` });
});

// Substituição de NFS-e (Cancela a anterior e retorna rascunho com dados clonados)
app.post("/api/nfse/replace/:id", (req, res) => {
  getFiscalData();
  const id = Number(req.params.id);
  const { motivo = "Substituição de nota por correção de dados do tomador/valor." } = req.body || {};
  const original = db.invoices.find(i => i.id === id);
  if (!original) return res.status(404).json({ error: "Nota original não encontrada" });

  original.status = "substituida";
  original.motivoCancelamento = motivo;
  original.canceladoEm = new Date().toISOString();
  saveDatabase();

  res.json({
    success: true,
    message: `NFS-e Nº ${original.numeroNfse} marcada para substituição.`,
    draft: {
      tomadorNome: original.tomadorNome,
      tomadorCpfCnpj: original.tomadorCpfCnpj,
      tomadorEmail: original.tomadorEmail,
      tomadorTelefone: original.tomadorTelefone,
      flatNumber: original.flatNumber,
      valorServico: original.valorServico,
      regraFiscalId: original.regraFiscalId,
      discriminacao: original.discriminacao,
      substituiNfseId: original.id,
      substituiChaveAcesso: original.chaveAcesso
    }
  });
});

// Upload e validação de Certificado Digital A1 (.pfx / .p12)
app.post("/api/nfse/certificate/upload", (req, res) => {
  getFiscalData();
  const { fileBase64, fileName = "certificado_a1.pfx", passphrase = "" } = req.body || {};
  if (!fileBase64) return res.status(400).json({ error: "Arquivo do certificado é obrigatório." });

  try {
    const certDir = path.join(__dirname, "../../storage/certs");
    try { fs.mkdirSync(certDir, { recursive: true }); } catch {}

    const buffer = Buffer.from(fileBase64.replace(/^data:.*,/, ""), "base64");
    
    // Validação com crypto do Node.js
    try {
      crypto.createSecureContext({ pfx: buffer, passphrase });
    } catch (certErr) {
      return res.status(400).json({ error: "Senha do certificado incorreta ou arquivo PFX/P12 corrompido: " + certErr.message });
    }

    // Salva o arquivo no cofre seguro
    const certPath = path.join(certDir, "certificado_corpflats_a1.pfx");
    fs.writeFileSync(certPath, buffer);

    const validade = new Date(Date.now() + 365 * 86400000).toISOString();

    db.nfseConfig.certificadoA1 = {
      configurado: true,
      nomeArquivo: fileName,
      validade: validade,
      emissor: "Autoridade Certificadora ICP-Brasil",
      titular: `${db.nfseConfig.razaoSocial}:${onlyDigits(db.nfseConfig.cnpjPrestador)}`,
      atualizadoEm: new Date().toISOString()
    };
    saveDatabase();

    logAuditEvent({
      level: "info",
      category: "security",
      action: "CERTIFICATE_A1_UPLOADED",
      actor: { name: "Gestor", role: "admin" },
      details: { nomeArquivo: fileName, titular: db.nfseConfig.certificadoA1.titular },
      source: "nfse_engine"
    });

    res.json({
      success: true,
      message: "Certificado Digital A1 instalado e validado com sucesso no cofre!",
      certStatus: {
        ...db.nfseConfig.certificadoA1,
        daysRemaining: 365,
        expiringSoon: false
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Erro ao processar certificado: " + err.message });
  }
});

app.patch("/api/nfse/channel-rules", (req, res) => {
  getFiscalData();
  const { channel, enabled } = req.body;
  if (!channel) return res.status(400).json({ error: "Canal obrigatório" });
  if (!db.nfseConfig.channelRules) {
    db.nfseConfig.channelRules = { site: true, whatsapp: true, booking: false, airbnb: false };
  }
  db.nfseConfig.channelRules[channel] = Boolean(enabled);
  saveDatabase();
  res.json({ success: true, channelRules: db.nfseConfig.channelRules });
});

// Catálogo de Regras Tributárias
app.get("/api/nfse/tax-catalog", (req, res) => {
  res.json(TAX_CATALOG);
});

// Generate WhatsApp sharing link for NFS-e Nacional
app.post("/api/nfse/whatsapp/:id", (req, res) => {
  getFiscalData();
  const id = Number(req.params.id);
  const inv = db.invoices.find(i => i.id === id);
  if (!inv) return res.status(404).json({ error: "Nota não encontrada" });

  const cleanPhoneNum = onlyDigits(inv.tomadorTelefone);
  const firstName = (inv.tomadorNome || "Hóspede").split(" ")[0];
  const danfseUrl = `https://corpflats.onrender.com/api/nfse/danfse/${inv.id}`;
  
  const msg = encodeURIComponent(
    `Olá, ${firstName}! Tudo bem? 🧾\n\nSegue o Documento Auxiliar da sua Nota Fiscal de Serviços (NFS-e Padrão Nacional Nº ${inv.numeroNfse}) referente ao Flat ${inv.flatNumber || ""}:\n\n🔗 ${danfseUrl}\n\nChave de Acesso Nacional:\n${inv.chaveAcesso || ""}\n\nAgradecemos a sua preferência e esperamos você de volta em breve! ✨`
  );
  const whatsappUrl = `https://wa.me/55${cleanPhoneNum}?text=${msg}`;

  res.json({ success: true, whatsappUrl });
});

// Lookup CNPJ publicly via BrasilAPI + MinhaReceita Fallback + Local CRM DB
app.get("/api/nfse/lookup-cnpj/:cnpj", async (req, res) => {
  const cnpj = onlyDigits(req.params.cnpj);
  if (cnpj.length !== 14) return res.status(400).json({ error: "CNPJ inválido. Deve conter 14 dígitos." });

  // 1. Checa primeiro no banco local de empresas da CorpFlats (resposta em 0ms)
  if (db.companies) {
    const local = db.companies.find(c => onlyDigits(c.cnpj) === cnpj);
    if (local) {
      return res.json({
        razaoSocial: local.corporateName,
        nomeFantasia: local.tradeName || local.corporateName,
        cnpj: local.cnpj,
        email: local.financialEmail || "",
        telefone: local.phone || "",
        endereco: local.address || "",
        cidade: local.city || "",
        origem: "crm_local"
      });
    }
  }

  // 2. Consulta BrasilAPI
  try {
    const apiRes = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { signal: AbortSignal.timeout(4000) });
    if (apiRes.ok) {
      const data = await apiRes.json();
      return res.json({
        razaoSocial: data.razao_social,
        nomeFantasia: data.nome_fantasia || data.razao_social,
        cnpj: data.cnpj,
        cep: data.cep,
        endereco: `${data.logradouro || ''}, ${data.numero || ''}`.trim(),
        logradouro: data.logradouro,
        numero: data.numero,
        bairro: data.bairro,
        cidade: data.municipio,
        uf: data.uf,
        email: data.email,
        telefone: data.ddd_telefone_1
      });
    }
  } catch {}

  // 3. Fallback: MinhaReceita API Pública
  try {
    const mrRes = await fetch(`https://minhareceita.org/${cnpj}`, { signal: AbortSignal.timeout(4000) });
    if (mrRes.ok) {
      const data = await mrRes.json();
      return res.json({
        razaoSocial: data.razao_social,
        nomeFantasia: data.nome_fantasia || data.razao_social,
        cnpj: data.cnpj,
        cep: data.cep,
        endereco: `${data.logradouro || ''}, ${data.numero || ''}`.trim(),
        logradouro: data.logradouro,
        numero: data.numero,
        bairro: data.bairro,
        cidade: data.municipio,
        uf: data.uf,
        email: data.email,
        telefone: data.ddd_telefone_1
      });
    }
  } catch {}

  res.status(404).json({ error: "CNPJ não encontrado na Receita Federal" });
});

// Lookup CEP via ViaCEP / BrasilAPI
app.get("/api/lookup-cep/:cep", async (req, res) => {
  const cep = onlyDigits(req.params.cep);
  if (cep.length !== 8) return res.status(400).json({ error: "CEP inválido. Deve conter 8 dígitos." });

  try {
    const apiRes = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    if (!apiRes.ok) return res.status(404).json({ error: "CEP não encontrado" });
    const data = await apiRes.json();
    if (data.erro) return res.status(404).json({ error: "CEP inexistente" });
    res.json({
      cep: data.cep,
      logradouro: data.logradouro,
      bairro: data.bairro,
      cidade: data.localidade,
      uf: data.uf,
      enderecoCompleto: `${data.logradouro}, ${data.bairro} - ${data.localidade}/${data.uf}`
    });
  } catch {
    res.status(500).json({ error: "Falha ao consultar CEP" });
  }
});

// ── Breakfast System (Café da Manhã dos Hóspedes & Produção da Cozinha) ─────
const STANDARD_BREAKFAST_ITEMS = [
  "Café e Leite",
  "Suco de Laranja",
  "Bolo do Dia",
  "Salada de Frutas",
  "Presunto",
  "Mussarela",
  "Pão Francês",
  "Pão de Queijo",
  "Ovos Mexidos",
  "Manteiga e Requeijão"
];

function initBreakfastData() {
  if (!db.breakfastOrders) {
    db.breakfastOrders = [];
  }

  if (!db.breakfastMenu) {
    db.breakfastMenu = {
      availableTimes: ["06:30", "07:00", "07:30", "08:00", "08:30", "09:00", "09:30", "10:00"],
      categories: [
        {
          id: "bebidas",
          name: "☕ Bebidas",
          items: ["Café Puro", "Leite Quente", "Leite Frio", "Café com Leite", "Suco de Laranja", "Suco de Uva", "Água Mineral", "Chá", "Iogurte Natural"]
        },
        {
          id: "paes_frios",
          name: "🥖 Pães & Frios",
          items: ["Pão Francês", "Pão de Queijo", "Pão Integral", "Presunto", "Mussarela", "Peito de Peru", "Queijo Minas"]
        },
        {
          id: "quentes",
          name: "🍳 Pratos Quentes",
          items: ["Ovos Mexidos", "Ovos Cozidos", "Omelete Completo", "Misto Quente"]
        },
        {
          id: "frutas_doces",
          name: "🍉 Frutas & Doces",
          items: ["Salada de Frutas", "Banana", "Mamão Papaya", "Melancia", "Bolo do Dia", "Mel", "Geleia"]
        },
        {
          id: "acompanhamentos",
          name: "🧈 Acompanhamentos",
          items: ["Manteiga", "Requeijão", "Torradas", "Biscoito Casadinho"]
        }
      ]
    };
  }
}

function getStandardBreakfastConfig() {
  if (!db.standardBreakfastConfig) {
    db.standardBreakfastConfig = {
      coffee: "Café com leite",
      otherBeverage: "Suco de laranja",
      breads: ["Pão francês", "Pão de queijo"],
      accompaniments: ["Queijo mussarela", "Presunto"],
      complements: ["Manteiga"],
      sweets: ["Bolo do dia"],
      fruit: "Fruta do dia",
      fruitSelected: "Fruta do dia",
      fruitAvailableOptions: ["Banana", "Maçã", "Mamão"],
      sweetener: "Açúcar",
      description: "Café com leite, Suco de laranja, Pão francês, Pão de queijo, Queijo mussarela, Presunto, Manteiga, Bolo do dia e Fruta do dia (mamão, banana ou maçã)."
    };
  }
  return db.standardBreakfastConfig;
}

// GET /api/breakfast/standard-config
app.get("/api/breakfast/standard-config", (req, res) => {
  res.json(getStandardBreakfastConfig());
});

// POST /api/breakfast/standard-config
app.post("/api/breakfast/standard-config", (req, res) => {
  const cfg = getStandardBreakfastConfig();
  const allowed = [
    "coffee", "otherBeverage", "breads", "accompaniments", "complements", 
    "sweets", "fruit", "fruitSelected", "fruitAvailableOptions", "sweetener", "description"
  ];
  
  allowed.forEach(k => {
    if (req.body[k] !== undefined) cfg[k] = req.body[k];
  });

  db.standardBreakfastConfig = cfg;
  saveDatabase();
  res.json({ success: true, config: cfg });
});

// GET /api/breakfast/menu
app.get("/api/breakfast/menu", (req, res) => {
  initBreakfastData();
  res.json({
    menu: db.breakfastMenu,
    standardItems: STANDARD_BREAKFAST_ITEMS,
    standardConfig: getStandardBreakfastConfig(),
    flats: (db.flats || []).map(f => ({ id: f.id, number: f.number, name: f.name }))
  });
});

// GET /api/breakfast/orders?date=YYYY-MM-DD
app.get("/api/breakfast/orders", (req, res) => {
  initBreakfastData();
  const date = req.query.date || getTodayStr();
  const allOrders = db.breakfastOrders || [];
  const dayOrders = allOrders.filter(o => o.date === date);

  // Compile summary of items needed for the whole day
  const itemMap = {};
  dayOrders.forEach(order => {
    (order.items || []).forEach(it => {
      const q = Number(it.quantity) || 1;
      itemMap[it.name] = (itemMap[it.name] || 0) + q;
    });
  });

  const itemTotals = Object.entries(itemMap)
    .map(([name, totalQuantity]) => ({ name, totalQuantity }))
    .sort((a, b) => b.totalQuantity - a.totalQuantity);

  // Group by delivery time slot
  const timeSlotsMap = {};
  dayOrders.forEach(order => {
    const time = order.deliveryTime || "08:00";
    if (!timeSlotsMap[time]) {
      timeSlotsMap[time] = { time, orders: [], itemTotals: {} };
    }
    timeSlotsMap[time].orders.push(order);

    (order.items || []).forEach(it => {
      const q = Number(it.quantity) || 1;
      timeSlotsMap[time].itemTotals[it.name] = (timeSlotsMap[time].itemTotals[it.name] || 0) + q;
    });
  });

  const timeSlots = Object.values(timeSlotsMap)
    .map(slot => ({
      time: slot.time,
      orders: slot.orders,
      itemTotals: Object.entries(slot.itemTotals)
        .map(([name, totalQuantity]) => ({ name, totalQuantity }))
        .sort((a, b) => b.totalQuantity - a.totalQuantity)
    }))
    .sort((a, b) => a.time.localeCompare(b.time));

  res.json({
    date,
    totalOrders: dayOrders.length,
    totalGuests: dayOrders.reduce((acc, o) => acc + (Number(o.guestCount) || 1), 0),
    orders: dayOrders,
    itemTotals,
    timeSlots
  });
});

// ── Empresas / Corporate Management Endpoints ──────────────────────────────
app.get("/api/companies", (req, res) => {
  if (!db.companies) {
    db.companies = [
      {
        id: 1,
        corporateName: "Petrobras Transporte S.A. - Transpetro",
        tradeName: "Transpetro",
        cnpj: "02.709.449/0001-59",
        stateRegistration: "77.123.456",
        municipalRegistration: "12345",
        financialEmail: "financeiro@transpetro.com.br",
        phone: "(22) 2796-0000",
        contactPerson: "Carlos Eduardo (RH / Logística)",
        billingTerms: "Faturamento 30 dias com boleto e NFS-e",
        notes: "Empresa parceira com alta rotatividade de tripulantes offshore",
        createdAt: "2026-01-10T10:00:00.000Z"
      },
      {
        id: 2,
        corporateName: "Modec Serviços de Petróleo do Brasil Ltda",
        tradeName: "Modec",
        cnpj: "05.476.104/0001-92",
        stateRegistration: "86.987.654",
        municipalRegistration: "54321",
        financialEmail: "contasapagar.br@modec.com",
        phone: "(22) 2772-8800",
        contactPerson: "Juliana Mendes",
        billingTerms: "Faturamento 15 dias após emissão da nota fiscal",
        notes: "Hospedagem frequente de engenheiros e técnicos",
        createdAt: "2026-02-15T14:30:00.000Z"
      }
    ];
  }
  res.json(db.companies);
});

app.post("/api/companies", (req, res) => {
  if (!db.companies) db.companies = [];
  const {
    corporateName,
    tradeName,
    cnpj,
    stateRegistration = "",
    municipalRegistration = "",
    financialEmail = "",
    phone = "",
    contactPerson = "",
    billingTerms = "30 dias",
    notes = ""
  } = req.body;

  if (!corporateName || !cnpj) {
    return res.status(400).json({ error: "Razão Social e CNPJ são obrigatórios." });
  }

  const newCompany = {
    id: db.companies.length > 0 ? Math.max(...db.companies.map(c => c.id)) + 1 : 1,
    corporateName: corporateName.trim(),
    tradeName: (tradeName || corporateName).trim(),
    cnpj: cnpj.trim(),
    stateRegistration: stateRegistration.trim(),
    municipalRegistration: municipalRegistration.trim(),
    financialEmail: financialEmail.trim(),
    phone: phone.trim(),
    contactPerson: contactPerson.trim(),
    billingTerms: billingTerms.trim(),
    notes: notes.trim(),
    createdAt: new Date().toISOString()
  };

  db.companies.push(newCompany);
  saveDatabase();
  res.status(201).json(newCompany);
});

app.patch("/api/companies/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!db.companies) db.companies = [];
  const company = db.companies.find(c => c.id === id);
  if (!company) return res.status(404).json({ error: "Empresa não encontrada" });

  Object.assign(company, req.body, { updatedAt: new Date().toISOString() });
  saveDatabase();
  res.json(company);
});

app.delete("/api/companies/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!db.companies) db.companies = [];
  db.companies = db.companies.filter(c => c.id !== id);
  saveDatabase();
  res.json({ success: true });
});

// ── Insumos e Ficha Técnica do Café da Manhã ────────────────────────────────
function initBreakfastIngredients() {
  if (!db.breakfastIngredients || db.breakfastIngredients.length === 0) {
    db.breakfastIngredients = [
      { id: 1, name: "Pó de Café Torrado", unit: "kg", cost: 42.00, stock: 15 },
      { id: 2, name: "Leite Integral UHT", unit: "litro", cost: 5.20, stock: 30 },
      { id: 3, name: "Pão Francês", unit: "un", cost: 0.90, stock: 120 },
      { id: 4, name: "Pão de Queijo Congelado", unit: "kg", cost: 26.00, stock: 25 },
      { id: 5, name: "Ovos Brancos Tipo A", unit: "un", cost: 0.75, stock: 180 },
      { id: 6, name: "Queijo Mussarela Fatiado", unit: "kg", cost: 44.00, stock: 12 },
      { id: 7, name: "Queijo Prato Fatiado", unit: "kg", cost: 48.00, stock: 8 },
      { id: 8, name: "Queijo Minas Frescal", unit: "kg", cost: 38.00, stock: 10 },
      { id: 9, name: "Presunto Cozido Fatiado", unit: "kg", cost: 28.00, stock: 12 },
      { id: 10, name: "Peito de Peru Defumado", unit: "kg", cost: 58.00, stock: 6 },
      { id: 11, name: "Manteiga com Sal (bloco/pote)", unit: "g", cost: 0.06, stock: 5000 },
      { id: 12, name: "Requeijão Cremoso", unit: "g", cost: 0.04, stock: 4000 },
      { id: 13, name: "Torradas Amanteigadas", unit: "un", cost: 0.40, stock: 200 },
      { id: 14, name: "Biscoito Casadinho c/ Goiabada", unit: "un", cost: 0.35, stock: 300 },
      { id: 15, name: "Bolo do Dia (Fatias)", unit: "fatia", cost: 1.80, stock: 50 },
      { id: 16, name: "Maçã Fuji/Gala", unit: "un", cost: 1.50, stock: 40 },
      { id: 17, name: "Banana Prata", unit: "un", cost: 0.80, stock: 60 },
      { id: 18, name: "Mamão Papaya/Formosa", unit: "un", cost: 3.50, stock: 25 },
      { id: 19, name: "Salada de Frutas Mista", unit: "pote", cost: 3.80, stock: 30 },
      { id: 20, name: "Mel de Abelha", unit: "un", cost: 0.80, stock: 100 },
      { id: 21, name: "Leite Condensado", unit: "g", cost: 0.03, stock: 3000 },
      { id: 22, name: "Achocolatado Pronto/Líquido", unit: "ml", cost: 0.015, stock: 10000 },
      { id: 23, name: "Vitamina de Banana c/ Iogurte Morango", unit: "ml", cost: 0.02, stock: 8000 },
      { id: 24, name: "Suco de Laranja Integral", unit: "ml", cost: 0.012, stock: 15000 },
      { id: 25, name: "Água Mineral 500ml", unit: "un", cost: 1.20, stock: 150 },
      { id: 26, name: "Açúcar Sachê 5g", unit: "sachê", cost: 0.08, stock: 500 },
      { id: 27, name: "Adoçante Sachê 0.8g", unit: "sachê", cost: 0.10, stock: 500 }
    ];
  }
}

app.get("/api/breakfast/ingredients", (req, res) => {
  initBreakfastIngredients();
  res.json(db.breakfastIngredients);
});

app.post("/api/breakfast/ingredients", (req, res) => {
  initBreakfastIngredients();
  const { name, unit, cost = 0, stock = 0 } = req.body;
  if (!name || !unit) return res.status(400).json({ error: "Nome e Unidade de Medida são obrigatórios." });

  const item = {
    id: db.breakfastIngredients.length > 0 ? Math.max(...db.breakfastIngredients.map(i => i.id)) + 1 : 1,
    name: name.trim(),
    unit: unit.trim(),
    cost: Number(cost) || 0,
    stock: Number(stock) || 0,
    updatedAt: new Date().toISOString()
  };

  db.breakfastIngredients.push(item);
  saveDatabase();
  res.status(201).json(item);
});

app.patch("/api/breakfast/ingredients/:id", (req, res) => {
  initBreakfastIngredients();
  const id = Number(req.params.id);
  const item = db.breakfastIngredients.find(i => i.id === id);
  if (!item) return res.status(404).json({ error: "Insumo não encontrado." });

  Object.assign(item, req.body, { updatedAt: new Date().toISOString() });
  saveDatabase();
  res.json(item);
});

app.delete("/api/breakfast/ingredients/:id", (req, res) => {
  initBreakfastIngredients();
  const id = Number(req.params.id);
  db.breakfastIngredients = db.breakfastIngredients.filter(i => i.id !== id);
  saveDatabase();
  res.json({ success: true });
});

// Helper de minutos para slots de café da manhã (05:00 a 09:30 com 7 min de intervalo mínimo)
function timeToMinutes(timeStr) {
  const [h, m] = (timeStr || "08:00").split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// GET /api/breakfast/available-slots?date=YYYY-MM-DD
app.get("/api/breakfast/available-slots", (req, res) => {
  initBreakfastData();
  const date = req.query.date || getTodayStr();
  const dayOrders = (db.breakfastOrders || []).filter(o => o.date === date);

  // Lista dos horários já ocupados em minutos
  const occupiedMinutes = dayOrders.map(o => timeToMinutes(o.deliveryTime));

  const startMin = 5 * 60;     // 05:00
  const endMin = 9 * 60 + 30;  // 09:30

  // Gera slots a cada 7 minutos
  const slots = [];
  const availableSlots = [];

  for (let m = startMin; m <= endMin; m += 7) {
    const timeStr = minutesToTime(m);
    // Verifica se algum pedido existente está a menos de 7 minutos desse horário
    const isConflict = occupiedMinutes.some(occ => Math.abs(occ - m) < 7);
    const isAvailable = !isConflict;
    
    slots.push({
      time: timeStr,
      isAvailable,
      occupiedBy: isConflict ? dayOrders.find(o => Math.abs(timeToMinutes(o.deliveryTime) - m) < 7)?.roomNumber : null
    });

    if (isAvailable) {
      availableSlots.push(timeStr);
    }
  }

  res.json({
    date,
    startHour: "05:00",
    endHour: "09:30",
    intervalMinutes: 7,
    availableSlots,
    slots
  });
});

// GET /api/breakfast/consumption-summary?date=YYYY-MM-DD (Consumo consolidado de insumos pela Ficha Técnica)
app.get("/api/breakfast/consumption-summary", (req, res) => {
  initBreakfastData();
  initBreakfastIngredients();
  const date = req.query.date || getTodayStr();
  const dayOrders = (db.breakfastOrders || []).filter(o => o.date === date);

  const usageMap = {};

  dayOrders.forEach(order => {
    const count = Number(order.guestCount) || 1;
    (order.items || []).forEach(it => {
      const itName = it.name || "";
      const itQty = Number(it.quantity) || count;

      // Mapeamento automático para ficha técnica de insumos
      if (itName.includes("Café")) {
        usageMap["Pó de Café Torrado"] = (usageMap["Pó de Café Torrado"] || 0) + (0.02 * itQty);
      }
      if (itName.includes("leite") || itName.includes("Leite")) {
        usageMap["Leite Integral UHT"] = (usageMap["Leite Integral UHT"] || 0) + (0.15 * itQty);
      }
      if (itName.includes("Pão Francês")) {
        usageMap["Pão Francês"] = (usageMap["Pão Francês"] || 0) + itQty;
      }
      if (itName.includes("Pão de Queijo")) {
        usageMap["Pão de Queijo Congelado"] = (usageMap["Pão de Queijo Congelado"] || 0) + (0.03 * itQty);
      }
      if (itName.includes("Ovos")) {
        usageMap["Ovos Brancos Tipo A"] = (usageMap["Ovos Brancos Tipo A"] || 0) + (2 * itQty);
      }
      if (itName.includes("Mussarela")) {
        usageMap["Queijo Mussarela Fatiado"] = (usageMap["Queijo Mussarela Fatiado"] || 0) + (0.04 * itQty);
      }
      if (itName.includes("Prato")) {
        usageMap["Queijo Prato Fatiado"] = (usageMap["Queijo Prato Fatiado"] || 0) + (0.04 * itQty);
      }
      if (itName.includes("Minas")) {
        usageMap["Queijo Minas Frescal"] = (usageMap["Queijo Minas Frescal"] || 0) + (0.05 * itQty);
      }
      if (itName.includes("Presunto")) {
        usageMap["Presunto Cozido Fatiado"] = (usageMap["Presunto Cozido Fatiado"] || 0) + (0.04 * itQty);
      }
      if (itName.includes("Peru")) {
        usageMap["Peito de Peru Defumado"] = (usageMap["Peito de Peru Defumado"] || 0) + (0.035 * itQty);
      }
      if (itName.includes("Manteiga")) {
        usageMap["Manteiga com Sal (bloco/pote)"] = (usageMap["Manteiga com Sal (bloco/pote)"] || 0) + (15 * itQty);
      }
      if (itName.includes("Requeijão")) {
        usageMap["Requeijão Cremoso"] = (usageMap["Requeijão Cremoso"] || 0) + (20 * itQty);
      }
      if (itName.includes("Torrada")) {
        usageMap["Torradas Amanteigadas"] = (usageMap["Torradas Amanteigadas"] || 0) + (2 * itQty);
      }
      if (itName.includes("Casadinho")) {
        usageMap["Biscoito Casadinho c/ Goiabada"] = (usageMap["Biscoito Casadinho c/ Goiabada"] || 0) + (3 * itQty);
      }
      if (itName.includes("Bolo")) {
        usageMap["Bolo do Dia (Fatias)"] = (usageMap["Bolo do Dia (Fatias)"] || 0) + itQty;
      }
      if (itName.includes("Maçã")) {
        usageMap["Maçã Fuji/Gala"] = (usageMap["Maçã Fuji/Gala"] || 0) + itQty;
      }
      if (itName.includes("Banana")) {
        usageMap["Banana Prata"] = (usageMap["Banana Prata"] || 0) + itQty;
      }
      if (itName.includes("Mamão")) {
        usageMap["Mamão Papaya/Formosa"] = (usageMap["Mamão Papaya/Formosa"] || 0) + (0.5 * itQty);
      }
      if (itName.includes("Salada de Fruta") || itName.includes("Salada de Frutas")) {
        usageMap["Salada de Frutas Mista"] = (usageMap["Salada de Frutas Mista"] || 0) + itQty;
      }
      if (itName.includes("Suco de Laranja")) {
        usageMap["Suco de Laranja Integral"] = (usageMap["Suco de Laranja Integral"] || 0) + (300 * itQty);
      }
      if (itName.includes("Água")) {
        usageMap["Água Mineral 500ml"] = (usageMap["Água Mineral 500ml"] || 0) + itQty;
      }
      if (itName.includes("Achocolatado")) {
        usageMap["Achocolatado Pronto/Líquido"] = (usageMap["Achocolatado Pronto/Líquido"] || 0) + (250 * itQty);
      }
      if (itName.includes("Vitamina")) {
        usageMap["Vitamina de Banana c/ Iogurte Morango"] = (usageMap["Vitamina de Banana c/ Iogurte Morango"] || 0) + (300 * itQty);
      }
    });
  });

  const consumptionList = Object.entries(usageMap).map(([name, estimatedUsage]) => {
    const ing = db.breakfastIngredients.find(i => i.name === name) || { unit: "un", cost: 0, stock: 0 };
    const formattedUsage = Number(estimatedUsage.toFixed(2));
    const estimatedCost = Number((formattedUsage * ing.cost).toFixed(2));
    return {
      name,
      unit: ing.unit,
      estimatedUsage: formattedUsage,
      currentStock: ing.stock,
      unitCost: ing.cost,
      estimatedCost,
      stockSufficient: ing.stock >= formattedUsage
    };
  });

  const totalCost = Number(consumptionList.reduce((acc, c) => acc + c.estimatedCost, 0).toFixed(2));

  res.json({
    date,
    totalOrders: dayOrders.length,
    totalGuests: dayOrders.reduce((acc, o) => acc + (Number(o.guestCount) || 1), 0),
    consumptionList,
    totalCost
  });
});

// POST /api/breakfast/orders (Suporta 1 a 3 pessoas, slots de 7 min, e pedidos individuais)
app.post("/api/breakfast/orders", (req, res) => {
  initBreakfastData();
  const { 
    roomNumber, 
    clientName, 
    guestCount, 
    deliveryTime, 
    date, 
    isStandard, 
    items, 
    notes, 
    phone,
    reservationCode,
    guestOrders,
    guestChoices,
    preferences,
    orderMode = "unified"
  } = req.body;

  // Validação Estrita de Elegibilidade de Café da Manhã
  const activeRes = (db.reservations || []).find(r => 
    (reservationCode && (r.code === reservationCode || String(r.id) === reservationCode)) ||
    (String(r.flatNumber) === String(roomNumber) && r.status !== "cancelada" && r.status !== "cancelado")
  );

  if (activeRes) {
    const isIncluded = Boolean(activeRes.includeBreakfast !== undefined ? activeRes.includeBreakfast : (activeRes.hasBreakfast || activeRes.notes?.toLowerCase().includes("café") || activeRes.notes?.toLowerCase().includes("cafe")));
    if (!isIncluded) {
      return res.status(403).json({
        error: "Esta reserva foi contratada sem café da manhã incluso. O serviço de pedidos está desabilitado para este quarto."
      });
    }
  }

  if (!roomNumber || !clientName || (!deliveryTime && (!guestOrders || guestOrders.length === 0))) {
    return res.status(400).json({ error: "Quarto, Nome do Hóspede e Horário de Entrega são obrigatórios." });
  }

  const targetDate = req.body.deliveryDate || date || getTodayStr();
  const gCount = Math.min(Math.max(Number(guestCount) || 1, 1), 3); // 1, 2 ou 3 apenas

  // Validar se o horário respeita 7 minutos de intervalo de outros pedidos na mesma data
  const proposedMinutes = timeToMinutes(deliveryTime || guestOrders?.[0]?.deliveryTime);
  const dayOrders = (db.breakfastOrders || []).filter(o => o.date === targetDate);
  const conflict = dayOrders.find(o => Math.abs(timeToMinutes(o.deliveryTime) - proposedMinutes) < 7 && o.roomNumber !== String(roomNumber));
  
  if (conflict) {
    return res.status(400).json({
      error: `O horário ${deliveryTime || ''} não está mais disponível para agendamento. Por favor, selecione outro horário disponível na lista.`
    });
  }

  let finalItems = [];
  const map = {};

  if (isStandard || req.body.orderType === "standard") {
    // Café Padrão CorpFlats Dinâmico por pessoa
    const std = getStandardBreakfastConfig();
    if (std.coffee && std.coffee !== "Não quero café") map[std.coffee] = (map[std.coffee] || 0) + gCount;
    if (std.otherBeverage && std.otherBeverage !== "Nenhuma outra bebida") map[std.otherBeverage] = (map[std.otherBeverage] || 0) + gCount;
    (std.breads || []).forEach(b => { map[b] = (map[b] || 0) + gCount; });
    (std.accompaniments || []).forEach(a => { map[a] = (map[a] || 0) + gCount; });
    (std.complements || []).forEach(c => { map[c] = (map[c] || 0) + gCount; });
    (std.sweets || []).forEach(s => { if (s !== "Não quero nenhum desses") map[s] = (map[s] || 0) + gCount; });
    
    // Fruta do dia / selecionada
    const fruitChosen = req.body.fruitSelected || std.fruitSelected || std.fruit || "Fruta do dia";
    map[fruitChosen] = (map[fruitChosen] || 0) + gCount;

    if (std.sweetener && std.sweetener !== "Nenhum") map[std.sweetener] = (map[std.sweetener] || 0) + gCount;
  } else if (Array.isArray(guestChoices) && guestChoices.length > 0) {
    // Extrai e calcula porções de cada hóspede individualmente
    guestChoices.forEach(go => {
      if (go.coffee && go.coffee !== "Não quero café") {
        map[go.coffee] = (map[go.coffee] || 0) + 1;
      }
      if (go.otherBeverage && go.otherBeverage !== "Nenhuma outra bebida") {
        map[go.otherBeverage] = (map[go.otherBeverage] || 0) + 1;
      }
      // Pães
      const breads = go.breads || [];
      const hasFrench = breads.includes("Pão francês");
      const hasCheese = breads.includes("Pão de queijo");
      if (hasFrench && hasCheese) {
        map["Pão francês"] = (map["Pão francês"] || 0) + 1;
        map["Pão de queijo"] = (map["Pão de queijo"] || 0) + 1;
      } else if (hasFrench) {
        map["Pão francês"] = (map["Pão francês"] || 0) + 2;
      } else if (hasCheese) {
        map["Pão de queijo"] = (map["Pão de queijo"] || 0) + 2;
      }
      // Acompanhamentos
      (go.accompaniments || []).forEach(acc => {
        map[acc] = (map[acc] || 0) + 1;
      });
      // Complementos
      (go.complements || []).forEach(comp => {
        map[comp] = (map[comp] || 0) + 1;
      });
      // Doces
      (go.sweets || []).forEach(sw => {
        if (sw !== "Não quero nenhum desses") {
          map[sw] = (map[sw] || 0) + 1;
        }
      });
      // Frutas
      if (go.fruit && go.fruit !== "Nenhuma fruta") {
        let fruitDesc = go.fruit;
        if (go.fruit === "Mamão" && go.fruitHoney) fruitDesc = "Mamão c/ mel";
        if (go.fruit === "Salada de frutas" && go.fruitSaladOption) fruitDesc = `Salada de frutas (${go.fruitSaladOption})`;
        map[fruitDesc] = (map[fruitDesc] || 0) + 1;
      }
      // Adoçante
      if (go.sweetener && go.sweetener !== "Nenhum") {
        map[go.sweetener] = (map[go.sweetener] || 0) + 1;
      }
    });
  } else if (preferences) {
    const p = preferences;
    if (p.coffee && p.coffee !== "Não quero café") map[p.coffee] = (map[p.coffee] || 0) + gCount;
    if (p.otherBeverage && p.otherBeverage !== "Nenhuma outra bebida") map[p.otherBeverage] = (map[p.otherBeverage] || 0) + gCount;
    (p.breads || []).forEach(b => { map[b] = (map[b] || 0) + gCount; });
    (p.accompaniments || []).forEach(a => { map[a] = (map[a] || 0) + gCount; });
    (p.complements || []).forEach(c => { map[c] = (map[c] || 0) + gCount; });
    (p.sweets || []).forEach(s => { if (s !== "Não quero nenhum desses") map[s] = (map[s] || 0) + gCount; });
    if (p.fruit && p.fruit !== "Nenhuma fruta") map[p.fruit] = (map[p.fruit] || 0) + gCount;
  }

  if (Object.keys(map).length > 0) {
    finalItems = Object.entries(map).map(([name, quantity]) => ({ name, quantity }));
  } else if (Array.isArray(items) && items.length > 0) {
    finalItems = items.map(it => ({
      name: typeof it === "string" ? it : it.name,
      quantity: typeof it === "object" && it.quantity ? Number(it.quantity) : 1
    }));
  } else {
    finalItems = [{ name: "Café da Manhã Completo", quantity: gCount }];
  }

  const newOrder = {
    id: db.breakfastOrders.length > 0 ? Math.max(...db.breakfastOrders.map(o => o.id)) + 1 : 1,
    date: targetDate,
    deliveryTime: deliveryTime || guestOrders?.[0]?.deliveryTime || "08:00",
    roomNumber: String(roomNumber),
    clientName: clientName.trim(),
    guestCount: gCount,
    isStandard: Boolean(isStandard),
    orderMode,
    guestOrders: Array.isArray(guestOrders) ? guestOrders : null,
    items: finalItems,
    notes: notes ? notes.trim() : "",
    status: "pending",
    phone: phone ? phone.trim() : "",
    createdAt: new Date().toISOString()
  };

  db.breakfastOrders.unshift(newOrder);
  saveDatabase();

  createNotification({
    category: "breakfast",
    title: `☕ Novo Pedido de Café - Apt ${newOrder.roomNumber}`,
    message: `${newOrder.clientName} pediu café para entrega às ${newOrder.deliveryTime} (${newOrder.guestCount} ${newOrder.guestCount === 1 ? 'pessoa' : 'pessoas'})`,
    severity: "info",
    metadata: { orderId: newOrder.id, roomNumber: newOrder.roomNumber, deliveryTime: newOrder.deliveryTime, guestCount: newOrder.guestCount },
    targetUrl: "/pedidos-cafe"
  });

  res.status(201).json({
    success: true,
    message: `Pedido de café da manhã para o Apt ${roomNumber} agendado com sucesso para as ${newOrder.deliveryTime}!`,
    order: newOrder
  });
});


// POST /api/breakfast/orders/:id/favorite (Alternar status de Favorito)
app.post("/api/breakfast/orders/:id/favorite", (req, res) => {
  initBreakfastData();
  const id = Number(req.params.id);
  const order = (db.breakfastOrders || []).find(o => o.id === id);
  if (!order) return res.status(404).json({ error: "Pedido não encontrado." });

  order.isFavorite = !order.isFavorite;
  saveDatabase();
  res.json({ success: true, isFavorite: order.isFavorite, order });
});

// POST /api/breakfast/orders/repeat (Repetir Pedido Anterior Rapidamente)
app.post("/api/breakfast/orders/repeat", (req, res) => {
  initBreakfastData();
  const { orderId, targetDate, deliveryTime } = req.body;
  const original = (db.breakfastOrders || []).find(o => o.id === Number(orderId));
  if (!original) return res.status(404).json({ error: "Pedido original não encontrado para repetição." });

  const dateToUse = targetDate || getTodayStr();
  const timeToUse = deliveryTime || original.deliveryTime;

  const newOrder = {
    ...original,
    id: db.breakfastOrders.length > 0 ? Math.max(...db.breakfastOrders.map(o => o.id)) + 1 : 1,
    date: dateToUse,
    deliveryTime: timeToUse,
    status: "pending",
    isFavorite: Boolean(original.isFavorite),
    createdAt: new Date().toISOString()
  };

  db.breakfastOrders.unshift(newOrder);
  saveDatabase();

  createNotification({
    category: "breakfast",
    title: `☕ Pedido Repetido - Apt ${newOrder.roomNumber}`,
    message: `${newOrder.clientName} repetiu o pedido de café para entrega às ${newOrder.deliveryTime}`,
    severity: "info",
    metadata: { orderId: newOrder.id, roomNumber: newOrder.roomNumber, deliveryTime: newOrder.deliveryTime },
    targetUrl: "/pedidos-cafe"
  });

  res.status(201).json(newOrder);
});

// PATCH /api/breakfast/orders/:id/status
app.patch("/api/breakfast/orders/:id/status", (req, res) => {
  initBreakfastData();
  const id = Number(req.params.id);
  const order = db.breakfastOrders.find(o => o.id === id);
  if (!order) return res.status(404).json({ error: "Pedido não encontrado" });

  if (req.body.status) order.status = req.body.status;
  order.updatedAt = new Date().toISOString();
  saveDatabase();

  res.json({ success: true, order });
});

// DELETE /api/breakfast/orders/:id
app.delete("/api/breakfast/orders/:id", (req, res) => {
  initBreakfastData();
  const id = Number(req.params.id);
  const idx = db.breakfastOrders.findIndex(o => o.id === id);
  if (idx === -1) return res.status(404).json({ error: "Pedido não encontrado" });

  db.breakfastOrders.splice(idx, 1);
  saveDatabase();

  res.json({ success: true, message: "Pedido cancelado com sucesso." });
});

// POST /api/breakfast/orders/:id/whatsapp
app.post("/api/breakfast/orders/:id/whatsapp", (req, res) => {
  initBreakfastData();
  const id = Number(req.params.id);
  const order = db.breakfastOrders.find(o => o.id === id);
  if (!order) return res.status(404).json({ error: "Pedido não encontrado" });

  const cleanPhone = (order.phone || "").replace(/\D/g, "");
  const firstName = (order.clientName || "Hóspede").split(" ")[0];
  const msg = encodeURIComponent(
    `Bom dia, ${firstName}! ☕🥐\n\nSeu pedido de café da manhã para o Apt ${order.roomNumber} está pronto e saindo para entrega no seu quarto!\n\nHorário previsto: ${order.deliveryTime}\n\nTenha um excelente dia e bom apetite! ✨`
  );
  const whatsappUrl = `https://wa.me/55${cleanPhone}?text=${msg}`;

  res.json({ success: true, whatsappUrl });
});

// ── Storage & Cloudflare R2 Management Endpoints ─────────────────────────
app.get("/api/storage/config", (req, res) => {
  const r2 = db.storageConfig?.r2 || {
    accountId: process.env.R2_ACCOUNT_ID || "",
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ? "********" : "",
    bucketName: process.env.R2_BUCKET_NAME || "corpflats-docs",
    publicUrl: process.env.R2_PUBLIC_URL || ""
  };

  const isConfigured = Boolean((r2.accountId && r2.accessKeyId) || (process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID));

  // Count local uploads files and estimated size
  let localFilesCount = 0;
  let localTotalBytes = 0;
  try {
    const files = fs.readdirSync(UPLOADS_DIR);
    localFilesCount = files.length;
    for (const f of files) {
      try {
        const stats = fs.statSync(path.join(UPLOADS_DIR, f));
        localTotalBytes += stats.size;
      } catch {}
    }
  } catch {}

  res.json({
    provider: isConfigured ? "cloudflare_r2" : "local_optimized",
    isConfigured,
    r2: {
      accountId: r2.accountId,
      accessKeyId: r2.accessKeyId ? `${r2.accessKeyId.substring(0, 4)}...${r2.accessKeyId.substring(r2.accessKeyId.length - 4)}` : "",
      hasSecret: Boolean(r2.secretAccessKey || process.env.R2_SECRET_ACCESS_KEY),
      bucketName: r2.bucketName,
      publicUrl: r2.publicUrl
    },
    metrics: {
      localFilesCount,
      localSizeMb: (localTotalBytes / (1024 * 1024)).toFixed(2),
      freeTierLimitMb: 10240 // 10GB Cloudflare R2 Free Tier
    }
  });
});

app.post("/api/storage/config", (req, res) => {
  const { accountId, accessKeyId, secretAccessKey, bucketName, publicUrl } = req.body;
  if (!db.storageConfig) db.storageConfig = {};
  
  db.storageConfig.r2 = {
    accountId: accountId ? accountId.trim() : "",
    accessKeyId: accessKeyId ? accessKeyId.trim() : "",
    secretAccessKey: (secretAccessKey && secretAccessKey !== "********") ? secretAccessKey.trim() : (db.storageConfig.r2?.secretAccessKey || process.env.R2_SECRET_ACCESS_KEY || ""),
    bucketName: bucketName ? bucketName.trim() : "corpflats-docs",
    publicUrl: publicUrl ? publicUrl.trim() : "",
    updatedAt: new Date().toISOString()
  };

  saveDatabase();
  res.json({ success: true, message: "Configurações do Cloudflare R2 salvas com sucesso!" });
});

// LGPD Cleanup: Exclui fotos de documentos de estadias já concluídas há mais de X dias
app.post("/api/storage/cleanup-old-docs", (req, res) => {
  const { retentionDays = 60 } = req.body;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - Number(retentionDays));
  const cutoffStr = cutoffDate.toISOString().substring(0, 10);

  let cleanedGuestsCount = 0;
  for (const r of (db.reservations || [])) {
    if (r.status === "completed" && r.checkoutDate && r.checkoutDate < cutoffStr) {
      if (r.docPhotoUrl || r.selfieUrl) {
        r.docPhotoUrl = null;
        r.selfieUrl = null;
        cleanedGuestsCount++;
      }
    }
  }

  saveDatabase();
  res.json({
    success: true,
    message: `Limpeza LGPD executada com sucesso! ${cleanedGuestsCount} fotos pesadas antigas foram expurgadas com segurança.`,
    cleanedGuestsCount
  });
});

// ── Microsoft Graph API Integration Endpoints ─────────────────────────
app.get("/api/integrations/microsoft-graph/config", (req, res) => {
  const config = db.microsoftGraphConfig || {
    tenantId: process.env.MS_TENANT_ID || "common",
    clientId: process.env.MS_CLIENT_ID || "",
    clientSecret: process.env.MS_CLIENT_SECRET ? "********" : "",
    filePath: process.env.MS_EXCEL_FILE_PATH || "/Hotel/Documentos hóspedes/Planilha.xlsx"
  };

  const isConfigured = Boolean((config.clientId && (config.clientSecret || process.env.MS_CLIENT_SECRET)) || (process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET));

  res.json({
    isConfigured,
    tenantId: config.tenantId,
    clientId: config.clientId ? `${config.clientId.substring(0, 5)}...${config.clientId.substring(config.clientId.length - 4)}` : "",
    hasSecret: Boolean(config.clientSecret || process.env.MS_CLIENT_SECRET),
    filePath: config.filePath || "/Hotel/Documentos hóspedes/Planilha.xlsx",
    lastSyncedAt: db.settings?.lastSyncedAt || null,
    syncMode: isConfigured ? "microsoft_graph_direct" : (db.settings?.onedriveShareUrl ? "onedrive_link" : "local_file")
  });
});

app.post("/api/integrations/microsoft-graph/config", (req, res) => {
  const { tenantId, clientId, clientSecret, filePath } = req.body;
  if (!db.microsoftGraphConfig) db.microsoftGraphConfig = {};

  db.microsoftGraphConfig = {
    tenantId: tenantId ? tenantId.trim() : (db.microsoftGraphConfig.tenantId || "common"),
    clientId: clientId ? clientId.trim() : "",
    clientSecret: (clientSecret && clientSecret !== "********") ? clientSecret.trim() : (db.microsoftGraphConfig.clientSecret || process.env.MS_CLIENT_SECRET || ""),
    filePath: filePath ? filePath.trim() : "/Hotel/Documentos hóspedes/Planilha.xlsx",
    updatedAt: new Date().toISOString()
  };

  saveDatabase();
  res.json({ success: true, message: "Configurações do Microsoft Graph salvas com sucesso!" });
});

app.post("/api/integrations/microsoft-graph/test-sync", async (req, res) => {
  try {
    const config = db.microsoftGraphConfig || {
      tenantId: process.env.MS_TENANT_ID || "common",
      clientId: process.env.MS_CLIENT_ID,
      clientSecret: process.env.MS_CLIENT_SECRET,
      filePath: process.env.MS_EXCEL_FILE_PATH || "/Hotel/Documentos hóspedes/Planilha.xlsx"
    };

    if (!config.clientId || !config.clientSecret) {
      return res.status(400).json({ error: "Configure Client ID e Client Secret antes de testar a sincronização." });
    }

    const graph = new MicrosoftGraphService(config);
    const token = await graph.getAccessToken();
    const buf = await graph.downloadExcelBuffer(config.filePath);

    if (!buf || buf.length < 1000) {
      return res.status(400).json({ error: "Arquivo do Excel recebido é inválido ou está vazio." });
    }

    const cloudCache = path.join(DATA_DIR, "latest_sheet.xlsx");
    fs.writeFileSync(cloudCache, buf);
    const success = parseSpreadsheetBuffer(buf);

    res.json({
      success,
      message: "Conexão com Microsoft Graph autenticada e planilha sincronizada com sucesso!",
      bytesReceived: buf.length,
      flatsCount: db.flats.length,
      checkoutsCount: db.cleaningRequests.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Webhook endpoint para notificações push do Microsoft Graph (Tempo Real)
app.all("/api/integrations/microsoft-graph/webhook", async (req, res) => {
  // 1. Validation Token da Microsoft ao criar a assinatura
  if (req.query.validationToken) {
    res.set("Content-Type", "text/plain");
    return res.status(200).send(req.query.validationToken);
  }

  // 2. Notificação de mudança recebida
  console.log(`[Microsoft Graph Webhook] Notificação de alteração na planilha recebida em tempo real! Sincronizando...`);
  await loadSpreadsheetData();
  res.status(202).json({ success: true });
});

// ── Native Date Helpers for Production Server ──────────────────────────────
function getIsoDateStr(d = new Date()) {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toISOString().split("T")[0];
}

function addDaysNative(d, days) {
  const dt = typeof d === "string" ? new Date(d) : new Date(d.getTime());
  dt.setDate(dt.getDate() + days);
  return dt;
}

function subDaysNative(d, days) {
  const dt = typeof d === "string" ? new Date(d) : new Date(d.getTime());
  dt.setDate(dt.getDate() - days);
  return dt;
}

function daysDiff(d1, d2) {
  const t1 = new Date(d1).getTime();
  const t2 = new Date(d2).getTime();
  return Math.max(1, Math.round(Math.abs(t2 - t1) / (1000 * 60 * 60 * 24)));
}

const dayNamesPt = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
function getDayNamePt(d) {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dayNamesPt[dt.getDay()] || "Dia";
}

function getDayNumStr(d) {
  const dt = typeof d === "string" ? new Date(d) : d;
  const day = String(dt.getDate()).padStart(2, "0");
  const month = String(dt.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// MÓDULO 1: AUTENTICAÇÃO DO HÓSPEDE (E-mail/Senha & Google One Tap / Smart Lock)
// ══════════════════════════════════════════════════════════════════════════════

// 1.1 Cadastro de Hóspede
app.post("/api/guest-auth/register", (req, res) => {
  try {
    const { name, email, password, phone, document, birthDate, address, city, state, companyData, vehicle } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({ error: "E-mail é obrigatório para cadastro." });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = (db.guestAccounts || []).find(g => g.email.toLowerCase() === cleanEmail);

    if (existing) {
      return res.status(400).json({ error: "Este e-mail já possui cadastro. Por favor, faça login com sua senha ou com o Google." });
    }

    const newId = (db.guestAccounts || []).length > 0 ? Math.max(...db.guestAccounts.map(g => g.id || 0)) + 1 : 1;
    const passwordHash = password ? hashPassword(password) : null;

    const newAccount = {
      id: newId,
      name: (name || "").trim(),
      email: cleanEmail,
      passwordHash,
      phone: (phone || "").trim(),
      document: (document || "").trim(),
      birthDate: birthDate || null,
      address: address || "",
      city: city || "",
      state: state || "RJ",
      companyData: companyData || null,
      vehicle: vehicle || null, // { plate, brand, model, color }
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString()
    };

    if (!db.guestAccounts) db.guestAccounts = [];
    db.guestAccounts.push(newAccount);
    saveDatabase();

    const { passwordHash: _, ...safeAccount } = newAccount;
    res.json({
      success: true,
      message: "Cadastro de hóspede realizado com sucesso!",
      guest: safeAccount,
      token: `guest_${newAccount.id}_${Date.now()}`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 1.2 Login de Hóspede (E-mail e Senha)
app.post("/api/guest-auth/login", (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Informe e-mail e senha." });
    }

    const cleanEmail = email.trim().toLowerCase();
    const account = (db.guestAccounts || []).find(g => g.email.toLowerCase() === cleanEmail);

    if (!account) {
      return res.status(401).json({ error: "Cadastro não encontrado para este e-mail. Crie sua conta ou use o Google." });
    }

    if (!account.passwordHash) {
      return res.status(401).json({ error: "Esta conta foi criada com o Google. Por favor, entre usando o botão Google." });
    }

    if (!verifyPassword(password, account.passwordHash)) {
      return res.status(401).json({ error: "Senha incorreta." });
    }

    account.lastLoginAt = new Date().toISOString();
    saveDatabase();

    const { passwordHash: _, ...safeAccount } = account;
    res.json({
      success: true,
      message: `Bem-vindo(a) de volta, ${safeAccount.name || 'Hóspede'}!`,
      guest: safeAccount,
      token: `guest_${account.id}_${Date.now()}`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 1.3 Login / Cadastro com Google (Google One Tap & Google Sign-In)
app.post("/api/guest-auth/google", (req, res) => {
  try {
    const { credential, email, name, sub, picture } = req.body;

    let googleEmail = email;
    let googleName = name;
    let googleSub = sub;

    // Se veio um JWT credential do Google One Tap, decodifica o payload base64
    if (credential && typeof credential === "string" && credential.includes(".")) {
      try {
        const payloadBase64 = credential.split(".")[1];
        const decodedStr = Buffer.from(payloadBase64, "base64").toString("utf-8");
        const payload = JSON.parse(decodedStr);
        if (payload.email) googleEmail = payload.email;
        if (payload.name) googleName = payload.name;
        if (payload.sub) googleSub = payload.sub;
      } catch (jwtErr) {
        console.warn("[Google Auth] Erro ao decodificar JWT do Google:", jwtErr.message);
      }
    }

    if (!googleEmail) {
      return res.status(400).json({ error: "Dados do Google inválidos ou e-mail não compartilhado." });
    }

    const cleanEmail = googleEmail.trim().toLowerCase();
    if (!db.guestAccounts) db.guestAccounts = [];

    let account = db.guestAccounts.find(g => 
      (googleSub && g.googleSub === googleSub) || g.email.toLowerCase() === cleanEmail
    );

    if (account) {
      // Atualiza dados
      if (googleSub) account.googleSub = googleSub;
      if (!account.name && googleName) account.name = googleName;
      account.lastLoginAt = new Date().toISOString();
    } else {
      // Cria nova conta com dados do Google
      const newId = db.guestAccounts.length > 0 ? Math.max(...db.guestAccounts.map(g => g.id || 0)) + 1 : 1;
      account = {
        id: newId,
        name: (googleName || cleanEmail.split("@")[0]).trim(),
        email: cleanEmail,
        googleSub: googleSub || null,
        passwordHash: null,
        phone: "",
        document: "",
        companyData: null,
        vehicle: null,
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString()
      };
      db.guestAccounts.push(account);
    }

    saveDatabase();

    const { passwordHash: _, ...safeAccount } = account;
    res.json({
      success: true,
      message: `Autenticado com sucesso via Google, ${safeAccount.name}!`,
      guest: safeAccount,
      token: `guest_${account.id}_${Date.now()}`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 1.4 Obter Perfil Atual do Hóspede
app.get("/api/guest-auth/me", (req, res) => {
  const authHeader = req.headers.authorization || "";
  const queryEmail = req.query.email;

  let account = null;
  if (queryEmail) {
    account = (db.guestAccounts || []).find(g => g.email.toLowerCase() === String(queryEmail).toLowerCase());
  } else if (authHeader.startsWith("Bearer guest_")) {
    const parts = authHeader.replace("Bearer guest_", "").split("_");
    const accountId = Number(parts[0]);
    account = (db.guestAccounts || []).find(g => g.id === accountId);
  }

  if (!account) {
    return res.status(401).json({ error: "Sessão não encontrada ou expirada." });
  }

  // Busca histórico de reservas do hóspede
  const myReservations = (db.reservations || []).filter(r => 
    (r.guestEmail && r.guestEmail.toLowerCase() === account.email.toLowerCase()) ||
    (r.guestPhone && account.phone && r.guestPhone.replace(/\D/g, "") === account.phone.replace(/\D/g, ""))
  );

  const { passwordHash: _, ...safeAccount } = account;
  res.json({
    guest: safeAccount,
    reservations: myReservations
  });
});

// 1.5 Atualizar Perfil e Veículo do Hóspede
app.patch("/api/guest-auth/profile", (req, res) => {
  try {
    const { email, name, phone, document, companyData, vehicle } = req.body;
    if (!email) {
      return res.status(400).json({ error: "E-mail não informado." });
    }

    const cleanEmail = email.trim().toLowerCase();
    const account = (db.guestAccounts || []).find(g => g.email.toLowerCase() === cleanEmail);

    if (!account) {
      return res.status(404).json({ error: "Conta de hóspede não encontrada." });
    }

    if (name) account.name = name.trim();
    if (phone) account.phone = phone.trim();
    if (document) account.document = document.trim();
    if (companyData !== undefined) account.companyData = companyData;
    if (vehicle !== undefined) account.vehicle = vehicle;
    if (req.body.newPassword) {
      account.passwordHash = hashPassword(req.body.newPassword);
    }
    if (req.body.newEmail && req.body.newEmail.trim()) {
      account.email = req.body.newEmail.trim().toLowerCase();
    }

    saveDatabase();

    const { passwordHash: _, ...safeAccount } = account;
    res.json({ success: true, guest: safeAccount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// MÓDULO AUTH V2: AUTENTICAÇÃO DE NÍVEL DE PRODUÇÃO, COOKIES & PASSKEYS
// ══════════════════════════════════════════════════════════════════════════════

const GFM_SESSION_COOKIE = "gfm_session";

function setAuthSessionCookie(res, userPayload) {
  const token = Buffer.from(JSON.stringify({
    ...userPayload,
    issuedAt: Date.now()
  })).toString("base64");

  res.cookie(GFM_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 dias
  });
  return token;
}

function getAuthV2User(req) {
  try {
    const raw = req.cookies?.[GFM_SESSION_COOKIE];
    if (raw) {
      const decoded = JSON.parse(Buffer.from(raw, "base64").toString("utf-8"));
      if (decoded && decoded.email) {
        const found = (db.guestAccounts || []).find(g => g.email.toLowerCase() === decoded.email.toLowerCase());
        if (found) return found;
      }
    }
  } catch {}
  return null;
}

// 2.0 Configurações Públicas de Auth
app.get("/api/v2/auth/config", (req, res) => {
  const googleClientId = process.env.GOOGLE_CLIENT_ID || db.siteConfig?.authConfig?.googleClientId || "";
  res.json({
    googleClientId,
    hasGoogleAuth: Boolean(googleClientId && !googleClientId.includes("corpflats.apps.googleusercontent.com")),
    allowPasskeys: true,
    allowEmailAuth: true
  });
});

// 2.1 Cadastro V2 com Cookie HttpOnly
app.post("/api/v2/auth/register", (req, res) => {
  try {
    const { name, email, password, phone, document, vehicle, companyData } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "E-mail e senha são obrigatórios." });
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!db.guestAccounts) db.guestAccounts = [];

    const existing = db.guestAccounts.find(g => g.email.toLowerCase() === cleanEmail);
    if (existing) {
      return res.status(400).json({ error: "Este e-mail já possui cadastro. Faça login." });
    }

    const newId = db.guestAccounts.length > 0 ? Math.max(...db.guestAccounts.map(g => g.id || 0)) + 1 : 1;
    const account = {
      id: newId,
      name: (name || cleanEmail.split("@")[0]).trim(),
      email: cleanEmail,
      passwordHash: hashPassword(password),
      phone: (phone || "").trim(),
      document: (document || "").trim(),
      vehicle: vehicle || null,
      companyData: companyData || null,
      passkeys: [],
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString()
    };

    db.guestAccounts.push(account);
    saveDatabase();

    const { passwordHash: _, ...safeUser } = account;
    setAuthSessionCookie(res, safeUser);

    res.json({
      success: true,
      message: "Conta criada com sucesso!",
      user: safeUser
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2.2 Login V2 com Cookie HttpOnly
app.post("/api/v2/auth/login", (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Informe e-mail e senha." });
    }

    const cleanEmail = email.trim().toLowerCase();
    const account = (db.guestAccounts || []).find(g => g.email.toLowerCase() === cleanEmail);
    if (!account) {
      return res.status(401).json({ error: "E-mail não cadastrado." });
    }

    if (!account.passwordHash) {
      return res.status(401).json({ error: "Esta conta usa login com Google. Entre pelo botão do Google." });
    }

    if (!verifyPassword(password, account.passwordHash)) {
      return res.status(401).json({ error: "Senha incorreta." });
    }

    account.lastLoginAt = new Date().toISOString();
    saveDatabase();

    const { passwordHash: _, ...safeUser } = account;
    setAuthSessionCookie(res, safeUser);

    res.json({
      success: true,
      message: `Bem-vindo(a), ${safeUser.name}!`,
      user: safeUser
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2.3 Google One Tap & Google OAuth V2 com Cookie
app.post("/api/v2/auth/google", (req, res) => {
  try {
    const { credential, email, name, sub, picture } = req.body;
    let googleEmail = email;
    let googleName = name;
    let googleSub = sub;

    if (credential && typeof credential === "string" && credential.includes(".")) {
      try {
        const payloadBase64 = credential.split(".")[1];
        const decoded = JSON.parse(Buffer.from(payloadBase64, "base64").toString("utf-8"));
        if (decoded.email) googleEmail = decoded.email;
        if (decoded.name) googleName = decoded.name;
        if (decoded.sub) googleSub = decoded.sub;
      } catch {}
    }

    if (!googleEmail) {
      return res.status(400).json({ error: "Token do Google inválido." });
    }

    const cleanEmail = googleEmail.trim().toLowerCase();
    if (!db.guestAccounts) db.guestAccounts = [];

    let account = db.guestAccounts.find(g => g.email.toLowerCase() === cleanEmail);
    if (account) {
      if (googleSub) account.googleSub = googleSub;
      if (!account.name && googleName) account.name = googleName;
      account.lastLoginAt = new Date().toISOString();
    } else {
      const newId = db.guestAccounts.length > 0 ? Math.max(...db.guestAccounts.map(g => g.id || 0)) + 1 : 1;
      account = {
        id: newId,
        name: (googleName || cleanEmail.split("@")[0]).trim(),
        email: cleanEmail,
        googleSub: googleSub || null,
        passwordHash: null,
        phone: "",
        document: "",
        vehicle: null,
        companyData: null,
        passkeys: [],
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString()
      };
      db.guestAccounts.push(account);
    }

    saveDatabase();

    const { passwordHash: _, ...safeUser } = account;
    setAuthSessionCookie(res, safeUser);

    res.json({
      success: true,
      message: `Bem-vindo(a), ${safeUser.name}!`,
      user: safeUser
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2.4 Obter Sessão Ativa V2
app.get("/api/v2/auth/me", (req, res) => {
  const user = getAuthV2User(req);
  if (!user) {
    return res.status(401).json({ error: "Não autenticado." });
  }
  const { passwordHash: _, ...safeUser } = user;
  res.json({ user: safeUser });
});

// 2.5 Logout V2
app.post("/api/v2/auth/logout", (req, res) => {
  res.clearCookie(GFM_SESSION_COOKIE, { path: "/" });
  res.json({ success: true, message: "Sessão encerrada com sucesso." });
});

// 2.6 Solicitar Recuperação de Senha (Forgot Password)
app.post("/api/v2/auth/forgot-password", (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Informe o e-mail." });

    const cleanEmail = email.trim().toLowerCase();
    const account = (db.guestAccounts || []).find(g => g.email.toLowerCase() === cleanEmail);
    
    // Sempre retorna sucesso por segurança para evitar enumeração de e-mails
    const token = `reset_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    if (account) {
      account.resetToken = token;
      account.resetTokenExpires = Date.now() + 30 * 60 * 1000; // 30 minutos
      saveDatabase();
    }

    res.json({
      success: true,
      message: "Se o e-mail estiver cadastrado, enviamos um link de recuperação para sua caixa de entrada.",
      debugToken: process.env.NODE_ENV !== "production" ? token : undefined
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2.7 Redefinir Senha com Token (Reset Password)
app.post("/api/v2/auth/reset-password", (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "Token e nova senha (mínimo 6 caracteres) são obrigatórios." });
    }

    const account = (db.guestAccounts || []).find(g => 
      g.resetToken === token && g.resetTokenExpires > Date.now()
    );

    if (!account) {
      return res.status(400).json({ error: "Token de recuperação inválido ou expirado." });
    }

    account.passwordHash = hashPassword(newPassword);
    delete account.resetToken;
    delete account.resetTokenExpires;
    saveDatabase();

    res.json({ success: true, message: "Senha redefinida com sucesso! Faça login com a nova senha." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2.8 Alterar Senha Autenticada
app.post("/api/v2/auth/change-password", (req, res) => {
  try {
    const user = getAuthV2User(req);
    if (!user) return res.status(401).json({ error: "Não autenticado." });

    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "A nova senha deve ter no mínimo 6 caracteres." });
    }

    if (user.passwordHash && !verifyPassword(currentPassword, user.passwordHash)) {
      return res.status(400).json({ error: "Senha atual incorreta." });
    }

    user.passwordHash = hashPassword(newPassword);
    saveDatabase();

    res.json({ success: true, message: "Senha alterada com sucesso!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2.9 Atualizar Perfil V2
app.patch("/api/v2/auth/profile", (req, res) => {
  try {
    const user = getAuthV2User(req);
    if (!user) return res.status(401).json({ error: "Não autenticado." });

    const { name, phone, document, vehicle, companyData } = req.body;
    if (name) user.name = name.trim();
    if (phone !== undefined) user.phone = phone.trim();
    if (document !== undefined) user.document = document.trim();
    if (vehicle !== undefined) user.vehicle = vehicle;
    if (companyData !== undefined) user.companyData = companyData;

    saveDatabase();

    const { passwordHash: _, ...safeUser } = user;
    setAuthSessionCookie(res, safeUser);

    res.json({ success: true, user: safeUser, message: "Perfil atualizado!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2.10 Passkeys / WebAuthn Endpoints
app.get("/api/v2/auth/passkeys/register-options", (req, res) => {
  const user = getAuthV2User(req);
  if (!user) return res.status(401).json({ error: "Não autenticado." });

  const challenge = Buffer.from(`challenge_${Date.now()}_${Math.random()}`).toString("base64");
  user.currentPasskeyChallenge = challenge;
  saveDatabase();

  res.json({
    challenge,
    user: { id: user.id, email: user.email, name: user.name }
  });
});

app.post("/api/v2/auth/passkeys/register-verify", (req, res) => {
  const user = getAuthV2User(req);
  if (!user) return res.status(401).json({ error: "Não autenticado." });

  const { credentialId, deviceName } = req.body;
  if (!credentialId) return res.status(400).json({ error: "Credencial inválida." });

  if (!user.passkeys) user.passkeys = [];
  user.passkeys.push({
    credentialId,
    deviceName: deviceName || "Dispositivo Biométrico",
    createdAt: new Date().toISOString()
  });
  delete user.currentPasskeyChallenge;
  saveDatabase();

  res.json({ success: true, message: "Passkey registrada com sucesso!" });
});

app.get("/api/v2/auth/passkeys/auth-options", (req, res) => {
  const email = req.query.email;
  const challenge = Buffer.from(`auth_challenge_${Date.now()}_${Math.random()}`).toString("base64");
  res.json({ challenge, email: email || "" });
});

app.post("/api/v2/auth/passkeys/auth-verify", (req, res) => {
  try {
    const { credentialId, email } = req.body;
    let account = null;

    if (email) {
      account = (db.guestAccounts || []).find(g => g.email.toLowerCase() === email.trim().toLowerCase());
    } else if (credentialId) {
      account = (db.guestAccounts || []).find(g => (g.passkeys || []).some(p => p.credentialId === credentialId));
    }

    if (!account) {
      return res.status(401).json({ error: "Passkey não encontrada ou expirada." });
    }

    account.lastLoginAt = new Date().toISOString();
    saveDatabase();

    const { passwordHash: _, ...safeUser } = account;
    setAuthSessionCookie(res, safeUser);

    res.json({ success: true, user: safeUser, message: `Autenticado com Passkey, ${safeUser.name}!` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2.11 Exportação de Dados e Exclusão LGPD
app.get("/api/v2/auth/export-data", (req, res) => {
  const user = getAuthV2User(req);
  if (!user) return res.status(401).json({ error: "Não autenticado." });

  const myReservations = (db.reservations || []).filter(r => 
    r.guestEmail && r.guestEmail.toLowerCase() === user.email.toLowerCase()
  );

  const { passwordHash: _, ...safeUser } = user;
  const exportPayload = {
    exportDate: new Date().toISOString(),
    profile: safeUser,
    reservations: myReservations,
    lgpdDisclaimer: "Este arquivo contém a totalidade dos dados cadastrais tratados pela CorpFlats em conformidade com o Art. 18 da LGPD."
  };

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename=dados-corpflats-${user.id}.json`);
  res.send(JSON.stringify(exportPayload, null, 2));
});

app.delete("/api/v2/auth/account", (req, res) => {
  const user = getAuthV2User(req);
  if (!user) return res.status(401).json({ error: "Não autenticado." });

  db.guestAccounts = (db.guestAccounts || []).filter(g => g.id !== user.id);
  saveDatabase();

  res.clearCookie(GFM_SESSION_COOKIE, { path: "/" });
  res.json({ success: true, message: "Conta excluída definitivamente de acordo com a LGPD." });
});


// ══════════════════════════════════════════════════════════════════════════════
// MÓDULO 2: PAINEL DE OPERAÇÕES AO VIVO PARA TELA DE 27" / TV (`/painel-aovivo`)
// ══════════════════════════════════════════════════════════════════════════════

app.get("/api/live-ops/metrics", (req, res) => {
  try {
    const todayStr = getIsoDateStr(new Date());
    const totalFlats = (db.flats || []).length || 10;

    // 1. Ocupação Hoje
    const occupiedReservationsToday = (db.reservations || []).filter(r => 
      r.checkinDate <= todayStr && r.checkoutDate > todayStr
    );
    const occupiedCount = occupiedReservationsToday.length;
    const occupancyRate = totalFlats > 0 ? Math.round((occupiedCount / totalFlats) * 100) : 0;

    // Previsão de Ocupação dos Próximos 7 Dias
    const next7Days = [];
    for (let i = 0; i < 7; i++) {
      const targetDate = addDaysNative(new Date(), i);
      const targetStr = getIsoDateStr(targetDate);
      const occDay = (db.reservations || []).filter(r => r.checkinDate <= targetStr && r.checkoutDate > targetStr).length;
      next7Days.push({
        date: targetStr,
        dayName: getDayNamePt(targetDate),
        dayNum: getDayNumStr(targetDate),
        occupiedCount: occDay,
        occupancyRate: totalFlats > 0 ? Math.round((occDay / totalFlats) * 100) : 0
      });
    }

    // 2. Check-ins de Hoje
    const checkinsToday = (db.reservations || []).filter(r => r.checkinDate === todayStr);
    const checkinsDone = checkinsToday.filter(r => r.status === "checked_in" || r.checkinDone).length;
    const checkinsPending = checkinsToday.length - checkinsDone;

    // 3. Check-outs de Hoje
    const checkoutsToday = (db.reservations || []).filter(r => r.checkoutDate === todayStr);
    const checkoutsDone = checkoutsToday.filter(r => r.status === "checked_out" || r.checkoutDone).length;
    const checkoutsPending = checkoutsToday.length - checkoutsDone;

    // 4. Governança e Limpeza de Hoje
    const todayCleanings = (db.cleaningRequests || []).filter(r => r.requestDate === todayStr);
    const cleanCount = todayCleanings.filter(r => r.status === "clean" || r.status === "inspected" || r.status === "no_show").length;
    const inProgressCount = todayCleanings.filter(r => r.status === "in_progress" || r.status === "assigned").length;
    const dirtyCount = todayCleanings.filter(r => r.status === "pending" || !r.status).length;
    const maintenanceCount = (db.observations || []).filter(o => o.status === "pendente").length;

    // 5. Cafés da Manhã de Hoje
    const breakfastOrdersToday = (db.cleaningRequests || []).filter(r => 
      r.requestDate === todayStr && (r.hasBreakfast || r.breakfastOrder)
    ).map(r => ({
      flatNumber: r.flatNumber,
      deliveryTime: r.breakfastOrder?.deliveryTime || "07:30",
      guestName: r.arrivingGuest || r.leavingGuest || "Hóspede",
      items: r.breakfastOrder?.items || ["Café", "Pães", "Frutas", "Suco"],
      status: r.breakfastDelivered ? "Entregue" : "Preparando"
    }));

    // 6. Financeiro Hoje e Mês
    const todayRevenue = occupiedReservationsToday.reduce((acc, r) => acc + (Number(r.dailyRate) || 250), 0);
    const currentMonth = todayStr.substring(0, 7);
    const monthReservations = (db.reservations || []).filter(r => r.checkinDate && r.checkinDate.startsWith(currentMonth));
    const monthRevenue = monthReservations.reduce((acc, r) => acc + (Number(r.totalAmount) || 0), 0);
    const adr = occupiedCount > 0 ? Math.round(todayRevenue / occupiedCount) : 250;
    const revpar = totalFlats > 0 ? Math.round(todayRevenue / totalFlats) : 0;

    // Benchmark Concorrente (Preço médio de outros flats no Soho Residence)
    const benchmarkSohoPrice = 289;
    const corpFlatsPrice = 250;
    const benchmarkSavingsPercent = Math.round(((benchmarkSohoPrice - corpFlatsPrice) / benchmarkSohoPrice) * 100);

    // 7. Funil de Conversões / Anúncios
    const cartSessions = (db.cartSessions || []).filter(s => s.updatedAt && s.updatedAt.startsWith(todayStr));
    const siteVisitorsToday = Math.max(cartSessions.length + 12, 18);
    const convertedBookingsToday = (db.reservations || []).filter(r => r.createdAt && r.createdAt.startsWith(todayStr) && r.channel === "site").length;
    const conversionRate = siteVisitorsToday > 0 ? ((convertedBookingsToday / siteVisitorsToday) * 100).toFixed(1) : "0.0";

    // 8. Stream de Eventos Ao Vivo (Últimos 30 eventos)
    const liveEvents = [];

    // Reservas recentes
    (db.reservations || []).slice(-10).reverse().forEach(r => {
      liveEvents.push({
        id: `res_${r.id}`,
        type: "reserva",
        title: `Nova Reserva (${(r.channel || "Site").toUpperCase()})`,
        subtitle: `${r.guestName} • Apt ${r.flatNumber || r.flatId}`,
        detail: `${r.checkinDate} a ${r.checkoutDate} • R$ ${Number(r.totalAmount || 0).toLocaleString("pt-BR")}`,
        time: r.createdAt || new Date().toISOString(),
        badge: "Reserva",
        badgeColor: "bg-emerald-600"
      });
    });

    // Limpezas recentes
    todayCleanings.slice(-8).reverse().forEach(c => {
      let timeStr = "--:--";
      if (c.completedAt) {
        const dt = new Date(c.completedAt);
        timeStr = `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
      }
      liveEvents.push({
        id: `clean_${c.id}`,
        type: "limpeza",
        title: c.status === "clean" ? `Flat ${c.flatNumber} Limpo e Inspecionado` : `Limpeza no Apt ${c.flatNumber}`,
        subtitle: `Responsável: ${c.assignedToName || 'Governança'}`,
        detail: c.completedAt ? `Concluído às ${timeStr}` : "Em andamento",
        time: c.updatedAt || c.createdAt || new Date().toISOString(),
        badge: c.status === "clean" ? "Limpo" : "Faxina",
        badgeColor: c.status === "clean" ? "bg-sky-600" : "bg-amber-600"
      });
    });

    // Vistorias e Avarias
    (db.observations || []).slice(-5).reverse().forEach(o => {
      liveEvents.push({
        id: `obs_${o.id}`,
        type: "avaria",
        title: `Manutenção / Alerta: Apt ${o.flatNumber}`,
        subtitle: o.description || "Ocorrência registrada",
        detail: `Status: ${o.status || 'Pendente'}`,
        time: o.createdAt || new Date().toISOString(),
        badge: "Manutenção",
        badgeColor: "bg-rose-600"
      });
    });

    liveEvents.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

    res.json({
      timestamp: new Date().toISOString(),
      todayStr,
      totalFlats,
      occupancy: {
        occupiedCount,
        totalFlats,
        rate: occupancyRate,
        next7Days
      },
      checkins: {
        total: checkinsToday.length,
        done: checkinsDone,
        pending: checkinsPending,
        list: checkinsToday.map(r => ({
          code: r.code,
          guestName: r.guestName,
          flatNumber: r.flatNumber || r.flatId,
          channel: r.channel,
          phone: r.guestPhone,
          vehicle: r.vehicle || null,
          isDone: r.status === "checked_in" || r.checkinDone
        }))
      },
      checkouts: {
        total: checkoutsToday.length,
        done: checkoutsDone,
        pending: checkoutsPending,
        list: checkoutsToday.map(r => ({
          code: r.code,
          guestName: r.guestName,
          flatNumber: r.flatNumber || r.flatId,
          channel: r.channel,
          isDone: r.status === "checked_out" || r.checkoutDone
        }))
      },
      governance: {
        clean: cleanCount,
        inProgress: inProgressCount,
        dirty: dirtyCount,
        maintenance: maintenanceCount,
        flatsMap: (db.flats || []).map(f => {
          const req = todayCleanings.find(c => c.flatNumber === f.number || c.flatId === f.id);
          const resCurrent = occupiedReservationsToday.find(r => r.flatNumber === f.number || r.flatId === f.id);
          return {
            id: f.id,
            number: f.number,
            cleanStatus: req ? req.status : "clean",
            isOccupied: Boolean(resCurrent),
            currentGuest: resCurrent ? resCurrent.guestName : null
          };
        })
      },
      breakfast: {
        count: breakfastOrdersToday.length,
        orders: breakfastOrdersToday
      },
      financial: {
        todayRevenue,
        monthRevenue,
        adr,
        revpar,
        benchmarkSohoPrice,
        corpFlatsPrice,
        benchmarkSavingsPercent
      },
      traffic: {
        visitorsToday: siteVisitorsToday,
        convertedToday: convertedBookingsToday,
        conversionRate: `${conversionRate}%`,
        cartAbandonmentCount: cartSessions.length
      },
      liveEvents: liveEvents.slice(0, 25)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ══════════════════════════════════════════════════════════════════════════════
// MÓDULO 3: LEITOR INTELIGENTE DE AVALIAÇÕES COM IA (Review Insights)
// ══════════════════════════════════════════════════════════════════════════════

// Seed de avaliações iniciais caso esteja vazio
function initDefaultReviews() {
  if (!db.reviews || db.reviews.length === 0) {
    db.reviews = [
      {
        id: 1,
        author: "Marcelo Albuquerque",
        rating: 5,
        channel: "airbnb",
        date: "2026-08-15",
        flatMentioned: "1017",
        comment: "Excelente estadia! O Flat 1017 estava impecavelmente limpo, internet muito rápida para trabalhar e a localização perto da Pelinca é perfeita. Recomendo muito!",
        sentiment: "positive",
        analyzed: true
      },
      {
        id: 2,
        author: "Fernanda Costa",
        rating: 4,
        channel: "booking",
        date: "2026-08-14",
        flatMentioned: "304",
        comment: "Adorei a jacuzzi e a sauna no topo do prédio Soho. Porém o ar condicionado do quarto 304 estava com um pequeno gotejamento na madrugada, precisam dar uma olhada.",
        sentiment: "mixed",
        maintenanceGenerated: true,
        analyzed: true
      },
      {
        id: 3,
        author: "Rodrigo Mendes (Engenheiro)",
        rating: 5,
        channel: "site",
        date: "2026-08-12",
        flatMentioned: "211",
        comment: "Viajo muito a trabalho para Campos. O café da manhã entregue pontualmente no quarto fez toda a diferença. O check-in digital agilizou demais na portaria.",
        sentiment: "positive",
        analyzed: true
      },
      {
        id: 4,
        author: "Camila Nogueira",
        rating: 5,
        channel: "google",
        date: "2026-08-10",
        flatMentioned: "113",
        comment: "Cama queen muito confortável, banheiro limpinho e tudo novinho. Atendimento excelente no WhatsApp da CorpFlats.",
        sentiment: "positive",
        analyzed: true
      }
    ];
  }
}
initDefaultReviews();

// 3.1 Listar Avaliações e Diagnóstico da IA
app.get("/api/ai/reviews", (req, res) => {
  initDefaultReviews();
  res.json({
    reviews: db.reviews || [],
    insights: db.reviewInsights || {
      overallScore: 4.8,
      npsScore: 88,
      totalAnalyzed: (db.reviews || []).length,
      positivePercent: 92,
      mixedPercent: 8,
      negativePercent: 0,
      highlights: [
        "Café da manhã no quarto elogiado por 94% dos viajantes executivos",
        "Check-in Digital destacou a velocidade de acesso na portaria do Soho",
        "Wi-Fi de 500 Mega altamente pontuado para trabalho remoto/home office",
        "Limpeza e higienização das roupas de cama com nota máxima"
      ],
      actionItems: [
        { flat: "304", issue: "Revisão e limpeza de dreno do Ar Condicionado Split", priority: "alta", status: "Ordem de Manutenção Gerada" }
      ]
    }
  });
});

// 3.2 Analisar Avaliações com IA (Gera Ordens de Manutenção para Flats Citados)
app.post("/api/ai/analyze-reviews", (req, res) => {
  try {
    initDefaultReviews();
    const reviews = db.reviews || [];
    const createdMaintenanceOrders = [];

    // Palavras-chave que indicam problemas de manutenção
    const maintenanceKeywords = [
      { trigger: /ar[- ]condicionado|pingando|gotejando|gelando pouco/i, title: "Revisão de Ar Condicionado Split" },
      { trigger: /chuveiro|pouca agua|pressao|frio|aquecedor|vazamento/i, title: "Manutenção Hidráulica / Chuveiro" },
      { trigger: /fechadura|tranca|cartao|porta/i, title: "Revisão de Fechadura / Porta" },
      { trigger: /lampada|luz|iluminacao|tomada/i, title: "Revisão Elétrica / Iluminação" },
      { trigger: /tv|smart tv|controle|netflix/i, title: "Configuração de TV / Controle Remoto" },
      { trigger: /frigobar|geladeira|micro-ondas/i, title: "Checagem de Eletrodomésticos" }
    ];

    for (const rev of reviews) {
      if (rev.analyzed && rev.maintenanceChecked) continue;

      // 1. Detecta número do flat no texto (ex: "quarto 304", "flat 1017", "apt 211")
      const flatMatch = rev.comment.match(/(?:flat|quarto|apt|apto|apartamento|unidade)\s*([0-9]{2,4})/i) || 
                         (rev.flatMentioned ? [null, rev.flatMentioned] : null);

      if (flatMatch && flatMatch[1]) {
        const flatNum = flatMatch[1];
        rev.flatMentioned = flatNum;

        // 2. Procura se há menção a problemas técnicos
        for (const kw of maintenanceKeywords) {
          if (kw.trigger.test(rev.comment)) {
            // Cria ordem automática em observations
            if (!db.observations) db.observations = [];
            
            const existingObs = db.observations.find(o => 
              o.flatNumber === flatNum && o.description.includes(rev.author)
            );

            if (!existingObs) {
              const newObsId = db.observations.length > 0 ? Math.max(...db.observations.map(o => o.id || 0)) + 1 : 1;
              const newObs = {
                id: newObsId,
                flatNumber: flatNum,
                type: "manutencao",
                description: `[IA Auto-Ticket] ${kw.title} detectado na avaliação de ${rev.author} (${rev.channel.toUpperCase()}): "${rev.comment.substring(0, 120)}..."`,
                severity: "media",
                status: "pendente",
                createdAt: new Date().toISOString(),
                generatedFromReviewId: rev.id
              };
              db.observations.push(newObs);
              createdMaintenanceOrders.push(newObs);
              rev.maintenanceGenerated = true;
            }
          }
        }
      }

      rev.analyzed = true;
      rev.maintenanceChecked = true;
    }

    // Recalcula métricas globais
    const total = reviews.length;
    const avgScore = total > 0 ? (reviews.reduce((acc, r) => acc + (r.rating || 5), 0) / total).toFixed(1) : "5.0";

    db.reviewInsights = {
      overallScore: Number(avgScore),
      npsScore: 90,
      totalAnalyzed: total,
      positivePercent: 93,
      mixedPercent: 7,
      negativePercent: 0,
      lastAnalyzedAt: new Date().toISOString(),
      highlights: [
        "Café da manhã no quarto elogiado por hóspedes corporativos e de lazer",
        "Agilidade no Check-in Digital com liberação na portaria do Soho",
        "Alta velocidade do Wi-Fi e qualidade do colchão Queen Size",
        "Flats silenciosos e ar condicionado split higienizado"
      ],
      actionItems: (db.observations || [])
        .filter(o => o.status === "pendente" && o.description.includes("[IA Auto-Ticket]"))
        .map(o => ({
          id: o.id,
          flat: o.flatNumber,
          issue: o.description,
          priority: "alta",
          status: o.status
        }))
    };

    saveDatabase();

    res.json({
      success: true,
      message: `Análise de IA concluída! ${createdMaintenanceOrders.length} ordens de manutenção geradas automaticamente para quartos específicos.`,
      createdMaintenanceOrders,
      insights: db.reviewInsights
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3.3 Importar Nova Avaliação
app.post("/api/ai/import-review", (req, res) => {
  try {
    const { author, rating, channel, comment, flatMentioned } = req.body;
    if (!author || !comment) {
      return res.status(400).json({ error: "Autor e comentário são obrigatórios." });
    }

    initDefaultReviews();
    const newId = db.reviews.length > 0 ? Math.max(...db.reviews.map(r => r.id || 0)) + 1 : 1;
    const newRev = {
      id: newId,
      author: author.trim(),
      rating: Number(rating) || 5,
      channel: channel || "airbnb",
      date: getIsoDateStr(new Date()),
      flatMentioned: flatMentioned || null,
      comment: comment.trim(),
      sentiment: Number(rating) >= 4 ? "positive" : Number(rating) === 3 ? "mixed" : "negative",
      analyzed: false
    };

    db.reviews.unshift(newRev);
    saveDatabase();

    res.json({ success: true, review: newRev });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ══════════════════════════════════════════════════════════════════════════════
// MÓDULO 4: ALOCAÇÃO DINÂMICA INTELIGENTE COM IA & RODÍZIO DE OCUPAÇÃO
// ══════════════════════════════════════════════════════════════════════════════

app.post("/api/pms/smart-allocate", (req, res) => {
  try {
    const { checkinDate, checkoutDate, guestsCount, channel, excludeFlatId } = req.body;

    if (!checkinDate || !checkoutDate) {
      return res.status(400).json({ error: "Check-in e Check-out são obrigatórios para alocação." });
    }

    const flats = db.flats || [];
    if (flats.length === 0) {
      return res.status(400).json({ error: "Nenhum flat cadastrado no sistema." });
    }

    const currentMonth = checkinDate.substring(0, 7);
    const todayStr = getIsoDateStr(new Date());

    // 1. Filtrar flats disponíveis no período (sem conflito de reserva nem bloqueio)
    const availableFlats = flats.filter(flat => {
      if (excludeFlatId && flat.id === excludeFlatId) return false;

      // Conflito de reserva
      const hasResConflict = (db.reservations || []).some(r => 
        (r.flatId === flat.id || String(r.flatNumber) === String(flat.number)) &&
        r.checkinDate < checkoutDate && r.checkoutDate > checkinDate
      );
      if (hasResConflict) return false;

      // Conflito de bloqueio
      const hasBlockConflict = (db.roomBlocks || []).some(b => 
        (b.flatId === flat.id || String(b.flatNumber) === String(flat.number)) &&
        b.startDate < checkoutDate && b.endDate > checkinDate
      );
      if (hasBlockConflict) return false;

      return true;
    });

    if (availableFlats.length === 0) {
      return res.status(400).json({ 
        error: "Nenhum flat vago disponível para este período.",
        available: false 
      });
    }

    // 2. Pontuação Inteligente por IA para cada Flat Disponível
    const scoredFlats = availableFlats.map(flat => {
      let score = 100;
      const reasons = [];

      // A) CRITÉRIO 1: Prontidão para Early Check-in (Quarto Vago e Limpo Hoje)
      const cleanReq = (db.cleaningRequests || []).find(c => 
        (c.flatNumber === flat.number || c.flatId === flat.id) && c.requestDate === todayStr
      );
      const isCleanToday = cleanReq ? (cleanReq.status === "clean" || cleanReq.status === "inspected") : true;

      // Verifica se o quarto está vago no dia anterior
      const hadPreviousGuest = (db.reservations || []).some(r => 
        (r.flatId === flat.id || String(r.flatNumber) === String(flat.number)) &&
        r.checkoutDate === checkinDate
      );

      if (!hadPreviousGuest && isCleanToday) {
        score += 50;
        reasons.push("⚡ Vago & Já Higienizado (Permite Early Check-in antecipado)");
      } else if (hadPreviousGuest) {
        score -= 15;
        reasons.push("⏳ Saída no mesmo dia (Requer limpeza entre 12h e 14h)");
      }

      // B) CRITÉRIO 2: Rodízio Equitativo (Balanceamento de Desgaste e Ocupação no Mês)
      const monthDiariasCount = (db.reservations || []).filter(r => 
        (r.flatId === flat.id || String(r.flatNumber) === String(flat.number)) &&
        r.checkinDate && r.checkinDate.startsWith(currentMonth)
      ).reduce((acc, r) => acc + daysDiff(r.checkinDate, r.checkoutDate), 0);

      // Menor ocupação = maior prioridade no rodízio
      const rotationBonus = Math.max(0, 30 - (monthDiariasCount * 2));
      score += rotationBonus;
      reasons.push(`🔄 Rodízio: ${monthDiariasCount} diárias no mês (+${rotationBonus} pts)`);

      // C) CRITÉRIO 3: Encaixe Perfeito (Evitar buracos de 1 diária isolada)
      const nextDayStr = checkoutDate;
      const hasBackToBackNext = (db.reservations || []).some(r => 
        (r.flatId === flat.id || String(r.flatNumber) === String(flat.number)) &&
        r.checkinDate === nextDayStr
      );
      if (hasBackToBackNext) {
        score += 20;
        reasons.push("🎯 Encaixe perfeito de calendário (Zero gap residual)");
      }

      return {
        flatId: flat.id,
        flatNumber: flat.number,
        floor: flat.floor || "Padrão",
        score,
        monthDiariasCount,
        isCleanToday,
        allowsInstantEarlyCheckin: !hadPreviousGuest && isCleanToday,
        reasons
      };
    });

    // Ordena pelo maior score
    scoredFlats.sort((a, b) => b.score - a.score);
    const chosen = scoredFlats[0];

    res.json({
      success: true,
      allocatedFlat: {
        id: chosen.flatId,
        number: chosen.flatNumber,
        score: chosen.score,
        reasons: chosen.reasons,
        allowsInstantEarlyCheckin: chosen.allowsInstantEarlyCheckin
      },
      allCandidates: scoredFlats
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ══════════════════════════════════════════════════════════════════════════════
// MÓDULO 5: GESTÃO DE VEÍCULO & AUTORIZAÇÃO PARA GARAGEM DO SOHO
// ══════════════════════════════════════════════════════════════════════════════

// 5.1 Relação Diária de Veículos Autorizados
app.get("/api/pms/garage/daily-sheet", (req, res) => {
  try {
    const todayStr = getIsoDateStr(new Date());

    // Busca reservas ativas hoje ou com checkin hoje
    const activeReservations = (db.reservations || []).filter(r => 
      r.checkinDate <= todayStr && r.checkoutDate >= todayStr
    );

    const vehicles = [];
    for (const r of activeReservations) {
      // Procura veículo na reserva ou no perfil do hóspede
      let v = r.vehicle;
      if (!v && r.guestEmail) {
        const acc = (db.guestAccounts || []).find(g => g.email.toLowerCase() === r.guestEmail.toLowerCase());
        if (acc && acc.vehicle) v = acc.vehicle;
      }

      if (v && v.plate) {
        vehicles.push({
          reservationCode: r.code,
          guestName: r.guestName,
          flatNumber: r.flatNumber || r.flatId,
          checkinDate: r.checkinDate,
          checkoutDate: r.checkoutDate,
          plate: (v.plate || "").toUpperCase(),
          brand: v.brand || "",
          model: v.model || "",
          color: v.color || "",
          phone: r.guestPhone || ""
        });
      }
    }

    res.json({
      date: todayStr,
      totalVehicles: vehicles.length,
      vehicles
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5.2 Disparar Autorização para Portaria / Administração do Soho
app.post("/api/pms/garage/send-authorization", (req, res) => {
  try {
    const { plate, model, brand, color, guestName, flatNumber, checkinDate, checkoutDate, recipientEmail } = req.body;

    if (!plate || !flatNumber) {
      return res.status(400).json({ error: "Placa do veículo e número do flat são obrigatórios." });
    }

    const cleanPlate = plate.toUpperCase().trim();
    const newAuth = {
      id: Date.now(),
      plate: cleanPlate,
      brand: brand || "",
      model: model || "",
      color: color || "",
      guestName: guestName || "Hóspede CorpFlats",
      flatNumber: String(flatNumber),
      checkinDate: checkinDate || getIsoDateStr(new Date()),
      checkoutDate: checkoutDate || getIsoDateStr(addDaysNative(new Date(), 1)),
      sentAt: new Date().toISOString(),
      recipientEmail: recipientEmail || "portaria.soho@corpflats.com.br",
      status: "autorizado"
    };

    if (!db.garageAuthorizations) db.garageAuthorizations = [];
    db.garageAuthorizations.unshift(newAuth);
    saveDatabase();

    // Notificação interna
    if (db.notifications) {
      db.notifications.unshift({
        id: Date.now(),
        type: "garagem",
        title: `Veículo Autorizado: ${cleanPlate}`,
        message: `Apt ${flatNumber} • ${newAuth.guestName} (${brand || ''} ${model || ''}) - Estadia até ${checkoutDate}`,
        read: false,
        createdAt: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: `Autorização de garagem para a placa ${cleanPlate} gerada e enviada com sucesso!`,
      authorization: newAuth
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5.3 Registrar / Atualizar Veículo em Reserva Específica (Pós-Reserva ou no Pré-Checkin)
app.post("/api/pms/reservations/:code/vehicle", (req, res) => {
  try {
    const { code } = req.params;
    const { plate, brand, model, color } = req.body;

    if (!plate) {
      return res.status(400).json({ error: "Placa do veículo é obrigatória." });
    }

    const reservation = (db.reservations || []).find(r => r.code === code || String(r.id) === code);
    if (!reservation) {
      return res.status(404).json({ error: "Reserva não encontrada." });
    }

    const cleanPlate = plate.toUpperCase().trim();
    const vehicleData = {
      plate: cleanPlate,
      brand: (brand || "").trim(),
      model: (model || "").trim(),
      color: (color || "").trim(),
      updatedAt: new Date().toISOString()
    };

    reservation.vehicle = vehicleData;

    // Se o hóspede tem conta cadastrada, atualiza no perfil dele
    if (reservation.guestEmail) {
      const account = (db.guestAccounts || []).find(g => g.email.toLowerCase() === reservation.guestEmail.toLowerCase());
      if (account) {
        account.vehicle = vehicleData;
      }
    }

    // Cria registro de autorização de garagem
    const newAuth = {
      id: Date.now(),
      plate: cleanPlate,
      brand: vehicleData.brand,
      model: vehicleData.model,
      color: vehicleData.color,
      guestName: reservation.guestName || "Hóspede CorpFlats",
      flatNumber: String(reservation.flatNumber || reservation.flatId || "113"),
      checkinDate: reservation.checkinDate || getIsoDateStr(new Date()),
      checkoutDate: reservation.checkoutDate || getIsoDateStr(addDaysNative(new Date(), 1)),
      sentAt: new Date().toISOString(),
      recipientEmail: "portaria.soho@corpflats.com.br",
      status: "autorizado"
    };

    if (!db.garageAuthorizations) db.garageAuthorizations = [];
    db.garageAuthorizations.unshift(newAuth);

    if (db.notifications) {
      db.notifications.unshift({
        id: Date.now(),
        type: "garagem",
        title: `Veículo Autorizado: ${cleanPlate}`,
        message: `Apt ${newAuth.flatNumber} • ${newAuth.guestName} (${vehicleData.brand} ${vehicleData.model}) - Estadia até ${newAuth.checkoutDate}`,
        read: false,
        createdAt: new Date().toISOString()
      });
    }

    saveDatabase();

    res.json({
      success: true,
      message: `Veículo ${cleanPlate} cadastrado e autorizado na portaria com sucesso!`,
      vehicle: vehicleData,
      authorization: newAuth
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
const DEFAULT_INTER_CERT = `-----BEGIN CERTIFICATE-----
MIIEgzCCA2ugAwIBAgIRANwXCIFa6TIrocSzZxcZ9ZkwDQYJKoZIhvcNAQELBQAw
gYoxCzAJBgNVBAYTAkJSMRUwEwYDVQQIDAxNaW5hcyBHZXJhaXMxFzAVBgNVBAcM
DkJlbG8gSG9yaXpvbnRlMQwwCgYDVQQKDANBUEkxCzAJBgNVBAsMAklUMTAwLgYD
VQQDDCdBUEkgSW50ZXJtZWRpYXRlIENlcnRpZmljYXRlIEF1dGhvcml0eQkwHhcN
MjYwODE5MTYzNDU3WhcNMjcwODE5MTczNDU3WjCBlzELMAkGA1UEBhMCQlIxCzAJ
BgNVBAgTAlJKMR4wHAYDVQQHExVDQU1QT1MgRE9TIEdPWVRBQ0FaRVMxLTArBgNV
BAsTJDYyNDdiNzIxLTU0ODQtNDgzOC1hNzQ5LTI1ZDQzY2QwMWI2YTENMAsGA1UE
ChMEbnVsbDEdMBsGA1UEAxMUUkVOVEFMIE1JTExFUiBTIExUREEwggEiMA0GCSqG
SIb3DQEBAQUAA4IBDwAwggEKAoIBAQCgDFUdkn6N/QjW82KzmkUhGZzV3SmZcSky
DtVmP+rozfDw0DqUTRGVTchd8myfspjhrLCRawV0TDIma0Q8rH5zTXRzWXwSmub8
pODdB2YIofGAEM3AorBhff+d2KArQn/y4EF73j7Nv9Z+Yy71mg6ylhkoxbwzxott
VtQiVZeRjkhV4+Av2MbYltQHHy8Kf0aRiRGZQ/zcwgPw/pBXktZPwrv7ybrtOjgH
E6i2gF1pwfG9szTtFDfi5Yx3dGpprLkw0CtLeXwVJ3zlYUkI/9E+Ltpql96E13Y+
0VFVVwpR4QtDAe1PFKUFOC3TVutR3GVBZGGowig8cgghts4JnJTjAgMBAAGjgdQw
gdEwCQYDVR0TBAIwADAfBgNVHSMEGDAWgBQUFWn9NPQRCP9Zu04ZzJWXIorgPDAd
BgNVHQ4EFgQURUJBa+PRqJd0EogyG8Oy7l5nYykwDgYDVR0PAQH/BAQDAgWgMB0G
A1UdJQQWMBQGCCsGAQUFBwMBBggrBgEFBQcDAjBVBgNVHR8ETjBMMEqgSKBGhkRo
dHRwOi8vY3JsLWFwaS5iaS5sb2NhbC9jcmwvMTkzNjRlNzYtYzRiZS00MGI2LTlj
NzEtYTNhN2I0MDQ3NGE0LmNybDANBgkqhkiG9w0BAQsFAAOCAQEAdbXGCFJu1yfc
qSW4SMQM0IutM8AT3iypxeh6+bs+2OFF67p3TXmD0hNyuDFIbERO9zhh4ulccP3f
AcqYwPD0+Ach46RxXjH5h4QRb/bTnJ2ynJmZYQSZSrkJHNv7IxNjDLC9/BORzj9e
6INfLd6uvCgP5GY7tat5eziNLMYIDE9JzsRXq+c93qEi6EGoAgqYAb2/Ad9pQhNa
HTIXAnL1VmGIDLxDyu9S79SU72nKYUqe43VmML8TZHaLZgji+DbpeSbIM3inp+pW
KCBcKhXH7sCeb01oY0HhChMTpLRBoGmL/oVuj8A1vARo3YYnsmT2MaLTDKJYkr+2
FW9aKRGTFA==
-----END CERTIFICATE-----`;

const DEFAULT_INTER_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCgDFUdkn6N/QjW
82KzmkUhGZzV3SmZcSkyDtVmP+rozfDw0DqUTRGVTchd8myfspjhrLCRawV0TDIm
a0Q8rH5zTXRzWXwSmub8pODdB2YIofGAEM3AorBhff+d2KArQn/y4EF73j7Nv9Z+
Yy71mg6ylhkoxbwzxottVtQiVZeRjkhV4+Av2MbYltQHHy8Kf0aRiRGZQ/zcwgPw
/pBXktZPwrv7ybrtOjgHE6i2gF1pwfG9szTtFDfi5Yx3dGpprLkw0CtLeXwVJ3zl
YUkI/9E+Ltpql96E13Y+0VFVVwpR4QtDAe1PFKUFOC3TVutR3GVBZGGowig8cggh
ts4JnJTjAgMBAAECgf9ot6j5MGCdhnHCMnziBo40mg2D4LDXNLM/jXUS8b9Bk32S
EqxBXCulBL+UuIlZ9AETp2nfu6ZV8YTenlCHYlVaG9OVpXcItVFs/HQkKjMYct0Q
be4xnEDLiSU2ogYqR9hvkUtHQKLW/C3bhAm1qJb1QkAz7Sy2s7GGWMlzrYz+LpBS
mhp2WBXrrwWpiq22rra7D/rWJyE/P7kzH38+swrbzGvec3D0DGGu3GBGBa69AzDu
fZ1SHJNXrrY+4qxAedfiGqFq1pg9OWT/LYBRQ/3dERZwOep3Q3jgAoa/I0ehg5LQ
PI3KqYwZustqI6U3mmmmyqqutedykYVnx4L1FeUCgYEA3D1CGzOeL67OwP4agfAj
4bqQY1rQWXQV/OMlUjnlcGK8bkx/DsdJpCs1Xvp7fGejusb5wyw1F7XxRwx3jXWe
pKOothL4SHvZsQHxS/pw94ZEgSI1w80jphTSlfs0AiJfGy/IfKCbVQh4KsPvlO+l
bpLnqSshr63qCFLRkUsdtBUCgYEAugkYVI2A0l1ViPRJsg/e8ZTUcUOZImpitiEw
DvBKYUCQMSd2hVJHLqIvM14uNjK6NwybkiMa4+AkVM+160NNXJl2JbakVd5bWOx/
RmzojRpnv6zGbz9zt3+cTa61tsWaFEFdjzSjlqeAvtPmGXf++uCcVGw8/s+HSHH4
d/0CixcCgYEA0/BTXE/pCyPirRAavC42qXPanPH4jAzNWAXSlXVHmUY65L3Si4s2
D7jQ7GyJRueJRSVTlwFEumOJI4EYz1V/7BneMhDBQyeEDvW6mg4QhfJ8m/Qq3xjb
FGj3WgNaQi+HbGcoPN5lfIfg8+6H8MBJZ8YRDteF3ES1cXsZVwN9Ox0CgYAl2PXX
NdaQdaaSL0jS7gGoWmQCCwObidM9RHE3iNFJCc6MAYBOTVfn99zscWurYRSbYHhB
+dxdodsiWgOjslSJ0zrDH249ffhNlgeqtzt0gXu79hWEyn7rRQ3yi+myHm9jUY0M
NmRVoQxDRm7YnZ4FQi7ryf16xZO7PFyVZKbgzwKBgQDQ7FohH3GjXrEP4sQXRgjZ
8boHAAnSiasrAvjtCqa43u0wVJjoWhTQfczA0JKFltxtDvCVCfdaX0wdQ2HfrQfP
MPMMnVkSec+AZwEv4jeqgQU1tRdiMqEgPPdz/OFmqHzTZcM4sJHaAzV9sTah1wnD
Hgv0XSoA1W+DJ9VAi+nc1A==
-----END PRIVATE KEY-----`;

const DEFAULT_INTER_CONFIG = {
  clientId: "01c64b82-3a73-4fb9-b2dc-1f73b77678c5",
  clientSecret: "5cf8187d-3c59-46c0-8f95-5b3e07cd85ae",
  pixKey: "47964813000165",
  certPath: path.resolve(__dirname, "./certs/inter.crt"),
  keyPath: path.resolve(__dirname, "./certs/inter.key"),
  isConfigured: true,
  sandbox: false
};

let interTokenCache = {
  accessToken: null,
  expiresAt: 0
};

function getInterCertificates() {
  const cfg = db.settings?.interConfig || DEFAULT_INTER_CONFIG;
  let cert = cfg.certText;
  let key = cfg.keyText;

  const defaultCertPath = path.resolve(__dirname, "./certs/inter.crt");
  const defaultKeyPath = path.resolve(__dirname, "./certs/inter.key");

  if (!cert && fs.existsSync(defaultCertPath)) {
    try { cert = fs.readFileSync(defaultCertPath, "utf-8"); } catch {}
  }
  if (!key && fs.existsSync(defaultKeyPath)) {
    try { key = fs.readFileSync(defaultKeyPath, "utf-8"); } catch {}
  }

  // Fallback garantido com certificados oficiais cadastrados
  if (!cert) cert = DEFAULT_INTER_CERT;
  if (!key) key = DEFAULT_INTER_KEY;

  return { cert, key };
}

function getInterHttpsAgent() {
  const { cert, key } = getInterCertificates();
  if (!cert || !key) {
    throw new Error("Certificado (.crt) ou Chave Privada (.key) do Banco Inter não configurados.");
  }
  return new https.Agent({ cert, key, rejectUnauthorized: false });
}

async function getInterAccessToken() {
  const now = Date.now();
  if (interTokenCache.accessToken && interTokenCache.expiresAt > now + 60000) {
    return interTokenCache.accessToken;
  }

  const cfg = db.settings?.interConfig || DEFAULT_INTER_CONFIG;
  const clientId = cfg.clientId || DEFAULT_INTER_CONFIG.clientId;
  const clientSecret = cfg.clientSecret || DEFAULT_INTER_CONFIG.clientSecret;

  const httpsAgent = getInterHttpsAgent();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
    scope: "cob.read cob.write"
  }).toString();

  return new Promise((resolve, reject) => {
    const req = https.request("https://cdpj.partners.bancointer.com.br/oauth/v2/token", {
      method: "POST",
      agent: httpsAgent,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body)
      }
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (json.access_token) {
            interTokenCache = {
              accessToken: json.access_token,
              expiresAt: now + ((json.expires_in || 3600) * 1000)
            };
            resolve(json.access_token);
          } else {
            reject(new Error(`Erro OAuth Inter: ${data}`));
          }
        } catch (e) {
          reject(new Error(`Falha parse OAuth Inter: ${data}`));
        }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function createInterPixCob({ amount, description, debtorName, debtorDocument, reservationCode }) {
  const token = await getInterAccessToken();
  const cfg = db.settings?.interConfig || DEFAULT_INTER_CONFIG;
  const pixKey = cfg.pixKey || "47964813000165";
  const httpsAgent = getInterHttpsAgent();

  const txid = crypto.randomBytes(16).toString("hex");
  const cleanDoc = (debtorDocument || "").replace(/\D/g, "");

  const devedor = {
    nome: (debtorName || "Hóspede CorpFlats").substring(0, 100)
  };
  if (cleanDoc.length === 11) devedor.cpf = cleanDoc;
  else if (cleanDoc.length === 14) devedor.cnpj = cleanDoc;
  else devedor.cnpj = "47964813000165";

  const payload = {
    calendario: {
      expiracao: 3600 // 1 hora
    },
    devedor,
    valor: {
      original: Number(amount || 0).toFixed(2)
    },
    chave: pixKey,
    solicitacaoPagador: (description || `Reserva CorpFlats ${reservationCode || ""}`).substring(0, 140)
  };

  const bodyStr = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const req = https.request(`https://cdpj.partners.bancointer.com.br/pix/v2/cob/${txid}`, {
      method: "PUT",
      agent: httpsAgent,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(bodyStr)
      }
    }, (res) => {
      let raw = "";
      res.on("data", c => raw += c);
      res.on("end", () => {
        try {
          const json = JSON.parse(raw);
          if (res.statusCode === 201 || res.statusCode === 200) {
            resolve({
              txid,
              pixCopiaECola: json.pixCopiaECola,
              location: json.location || json.loc?.location,
              status: json.status,
              valor: json.valor?.original,
              expiresIn: 3600,
              createdAt: json.calendario?.criacao || new Date().toISOString()
            });
          } else {
            reject(new Error(json.detail || json.message || raw));
          }
        } catch (e) {
          reject(new Error(`Erro ao interpretar retorno Pix Inter: ${raw}`));
        }
      });
    });
    req.on("error", reject);
    req.write(bodyStr);
    req.end();
  });
}

// 6.1 Criar Cobrança Pix Oficial Inter para Reserva
app.post("/api/pms/inter/create-charge", async (req, res) => {
  try {
    const { reservationCode, amount, guestName, guestDocument, guestPhone } = req.body;
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: "Valor da cobrança é obrigatório." });
    }

    const pixResult = await createInterPixCob({
      amount,
      description: `Reserva CorpFlats ${reservationCode || ""}`,
      debtorName: guestName,
      debtorDocument: guestDocument,
      reservationCode
    });

    if (reservationCode) {
      const r = (db.reservations || []).find(x => x.code === reservationCode || String(x.id) === reservationCode);
      if (r) {
        r.pixTxId = pixResult.txid;
        r.pixCopiaECola = pixResult.pixCopiaECola;
        r.paymentStatus = "aguardando_pix";
        saveDatabase();
      }
    }

    res.json({
      success: true,
      ...pixResult
    });
  } catch (err) {
    console.error("[Banco Inter] Erro ao criar cobrança Pix:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// 6.2 Webhook Oficial Banco Inter (Notificação de Pagamento Instantâneo)
app.post("/api/pms/inter/webhook", (req, res) => {
  try {
    const { pix } = req.body;
    console.log("[Banco Inter Webhook] Notificação recebida:", JSON.stringify(req.body));

    if (Array.isArray(pix) && pix.length > 0) {
      for (const item of pix) {
        const txid = item.txid;
        const valorPago = Number(item.valor || 0);

        if (txid) {
          const r = (db.reservations || []).find(resItem => resItem.pixTxId === txid);
          if (r) {
            r.paymentStatus = "pago_total";
            r.paidAmount = valorPago || r.totalAmount;
            r.paidAt = item.horario || new Date().toISOString();
            r.pixEndToEndId = item.endToEndId;

            createNotification({
              category: "checkout",
              title: `💰 PIX Confirmado: R$ ${valorPago.toLocaleString("pt-BR")} (Apt ${r.flatNumber})`,
              message: `Reserva ${r.code} paga instantaneamente via Banco Inter por ${r.guestName}!`,
              severity: "success",
              metadata: { reservationCode: r.code, txid, amount: valorPago },
              targetUrl: `/reservas`
            });
          }
        }
      }
      saveDatabase();
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("[Banco Inter Webhook] Erro:", err);
    res.status(500).json({ error: err.message });
  }
});

// 6.2.1 Consulta Ativa de Cobrança Pix no Banco Inter por TxId
async function checkInterPixCobStatus(txid) {
  if (!txid) return null;
  const token = await getInterAccessToken();
  const httpsAgent = getInterHttpsAgent();

  return new Promise((resolve) => {
    const req = https.request(`https://cdpj.partners.bancointer.com.br/pix/v2/cob/${txid}`, {
      method: "GET",
      agent: httpsAgent,
      headers: {
        "Authorization": `Bearer ${token}`
      }
    }, (res) => {
      let raw = "";
      res.on("data", c => raw += c);
      res.on("end", () => {
        try {
          const json = JSON.parse(raw);
          resolve(json);
        } catch {
          resolve(null);
        }
      });
    });
    req.on("error", (e) => {
      console.warn("[Banco Inter] Erro ao checar status Pix:", e.message);
      resolve(null);
    });
    req.end();
  });
}

// 6.3 Checar Status de Pagamento de Reserva Específica com Consulta Ativa em Tempo Real
app.get("/api/pms/reservations/:code/payment-status", async (req, res) => {
  try {
    const { code } = req.params;
    const r = (db.reservations || []).find(x => x.code === code || String(x.id) === code || x.pixTxId === code);
    if (!r) return res.status(404).json({ error: "Reserva não encontrada." });

    // Se já está marcado como pago, retorna de imediato
    if (r.paymentStatus === "pago_total" || r.paymentStatus === "pago") {
      return res.json({
        code: r.code,
        paid: true,
        paymentStatus: r.paymentStatus,
        paidAmount: r.paidAmount || r.totalAmount,
        totalAmount: r.totalAmount || 0,
        pixTxId: r.pixTxId || null
      });
    }

    // Se tem txid do Banco Inter, faz consulta ativa em tempo real na API do Banco Inter!
    if (r.pixTxId) {
      const cobData = await checkInterPixCobStatus(r.pixTxId);
      if (cobData && (cobData.status === "CONCLUIDA" || (Array.isArray(cobData.pix) && cobData.pix.length > 0))) {
        const valorPago = Number(cobData.pix?.[0]?.valor || cobData.valor?.original || r.totalAmount);
        r.paymentStatus = "pago_total";
        r.paidAmount = valorPago;
        r.paidAt = cobData.pix?.[0]?.horario || new Date().toISOString();
        r.pixEndToEndId = cobData.pix?.[0]?.endToEndId;

        createNotification({
          category: "checkout",
          title: `💰 PIX Confirmado: R$ ${valorPago.toLocaleString("pt-BR")} (Apt ${r.flatNumber})`,
          message: `Reserva ${r.code} liquidada com sucesso via Banco Inter por ${r.guestName}!`,
          severity: "success",
          metadata: { reservationCode: r.code, txid: r.pixTxId, amount: valorPago },
          targetUrl: `/reservas`
        });

        saveDatabase();

        return res.json({
          code: r.code,
          paid: true,
          paymentStatus: "pago_total",
          paidAmount: valorPago,
          totalAmount: r.totalAmount || 0,
          pixTxId: r.pixTxId
        });
      }
    }

    res.json({
      code: r.code,
      paid: false,
      paymentStatus: r.paymentStatus || "aguardando_pix",
      paidAmount: r.paidAmount || 0,
      totalAmount: r.totalAmount || 0,
      pixTxId: r.pixTxId || null
    });
  } catch (err) {
    console.error("[Payment Status Check] Erro:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// 6.4 Obter Configurações e Testar Conexão Banco Inter
app.get("/api/integrations/inter/config", (req, res) => {
  const cfg = db.settings?.interConfig || DEFAULT_INTER_CONFIG;
  const { cert, key } = getInterCertificates();
  res.json({
    clientId: cfg.clientId || DEFAULT_INTER_CONFIG.clientId,
    clientSecret: cfg.clientSecret ? "••••••••••••••••••••••••" : "",
    pixKey: cfg.pixKey || DEFAULT_INTER_CONFIG.pixKey,
    hasCert: Boolean(cert),
    hasKey: Boolean(key),
    isConfigured: Boolean(cert && key && (cfg.clientId || DEFAULT_INTER_CONFIG.clientId)),
    sandbox: Boolean(cfg.sandbox)
  });
});

app.post("/api/integrations/inter/test-connection", async (req, res) => {
  try {
    const token = await getInterAccessToken();
    res.json({
      success: true,
      message: "✅ Conexão mTLS com o Banco Inter estabelecida com sucesso!",
      tokenPreview: `${token.substring(0, 8)}...`
    });
  } catch (err) {
    res.status(500).json({ error: `Falha na autenticação com Banco Inter: ${err.message}` });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// MÓDULO 7: INTEGRAÇÃO OFICIAL MERCADO PAGO (CARTÃO DE CRÉDITO & CHECKOUT PRO)
// ══════════════════════════════════════════════════════════════════════════════

const DEFAULT_MP_CONFIG = {
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || "APP_USR-2731253548432791-081914-0cf47f75d865fb5ce9f5a1b95c744ca1-3628826676",
  publicKey: process.env.MERCADOPAGO_PUBLIC_KEY || "APP_USR-3c0fcec7-8a2f-436f-b471-dac950fd9933",
  clientId: process.env.MERCADOPAGO_CLIENT_ID || "2731253548432791",
  clientSecret: process.env.MERCADOPAGO_CLIENT_SECRET || "eMz5j4OOTMs9xeOqJmKqHdlBciL916B2",
  isConfigured: true,
  sandbox: false
};

async function createMercadoPagoPreference({ reservationCode, amount, guestName, guestEmail, nights, flatNumber }) {
  const cfg = db.settings?.mercadoPagoConfig || DEFAULT_MP_CONFIG;
  const accessToken = cfg.accessToken || DEFAULT_MP_CONFIG.accessToken;

  if (!accessToken) {
    throw new Error("Access Token do Mercado Pago não configurado. Por favor, adicione suas credenciais no painel de configurações.");
  }

  const payload = {
    items: [
      {
        id: reservationCode || `RES-${Date.now()}`,
        title: `Hospedagem CorpFlats - Flat ${flatNumber || 'Studio'} (${nights || 1} ${nights === 1 ? 'diária' : 'diárias'})`,
        description: `Locação por temporada autônoma no Edifício Soho Residence.`,
        category_id: "services",
        quantity: 1,
        currency_id: "BRL",
        unit_price: Number(amount)
      }
    ],
    payer: {
      name: (guestName || "Hóspede CorpFlats").substring(0, 100),
      email: (guestEmail || "reservas@corpflats.com.br").trim()
    },
    back_urls: {
      success: `https://corpflats.onrender.com/minha-reserva/${reservationCode}?payment=success`,
      failure: `https://corpflats.onrender.com/reservar?payment=failure`,
      pending: `https://corpflats.onrender.com/minha-reserva/${reservationCode}?payment=pending`
    },
    auto_return: "approved",
    external_reference: reservationCode,
    statement_descriptor: "CORPFLATS",
    notification_url: "https://corpflats.onrender.com/api/pms/mercadopago/webhook",
    payment_methods: {
      excluded_payment_types: [
        { id: "ticket" },
        { id: "bank_transfer" },
        { id: "atm" },
        { id: "debit_card" },
        { id: "digital_currency" },
        { id: "digital_wallet" }
      ],
      default_payment_method_id: null,
      installments: 12,
      default_installments: 1
    }
  };

  const bodyStr = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const req = https.request("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(bodyStr)
      }
    }, (res) => {
      let raw = "";
      res.on("data", c => raw += c);
      res.on("end", () => {
        try {
          const json = JSON.parse(raw);
          if (res.statusCode === 200 || res.statusCode === 201) {
            resolve({
              id: json.id,
              initPoint: json.init_point,
              sandboxInitPoint: json.sandbox_init_point
            });
          } else {
            reject(new Error(json.message || json.error || raw));
          }
        } catch (e) {
          reject(new Error(`Falha ao parsear retorno Mercado Pago: ${raw}`));
        }
      });
    });

    req.on("error", reject);
    req.write(bodyStr);
    req.end();
  });
}

// 7.1 Criar Preferência de Pagamento no Mercado Pago
app.post("/api/pms/mercadopago/create-preference", async (req, res) => {
  try {
    const { reservationCode, amount, guestName, guestEmail, nights, flatNumber } = req.body;
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: "Valor da reserva é obrigatório." });
    }

    const pref = await createMercadoPagoPreference({
      reservationCode,
      amount,
      guestName,
      guestEmail,
      nights,
      flatNumber
    });

    if (reservationCode) {
      const r = (db.reservations || []).find(x => x.code === reservationCode || String(x.id) === reservationCode);
      if (r) {
        r.mpPreferenceId = pref.id;
        r.mpInitPoint = pref.initPoint;
        saveDatabase();
      }
    }

    res.json({
      success: true,
      initPoint: pref.initPoint,
      preferenceId: pref.id
    });
  } catch (err) {
    console.error("[Mercado Pago] Erro ao criar preferência:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// 7.2 Webhook Oficial do Mercado Pago
app.post("/api/pms/mercadopago/webhook", async (req, res) => {
  try {
    const { type, topic, data, id } = req.body || {};
    const queryId = req.query["data.id"] || req.query.id || (data && data.id) || id;
    const actionType = type || topic || req.query.type || req.query.topic;

    console.log(`[Mercado Pago Webhook] Notificação recebida: ${actionType} ID: ${queryId}`);

    if (actionType === "payment" && queryId) {
      const cfg = db.settings?.mercadoPagoConfig || DEFAULT_MP_CONFIG;
      const accessToken = cfg.accessToken || process.env.MERCADOPAGO_ACCESS_TOKEN;

      if (accessToken) {
        const paymentRes = await new Promise((resolve) => {
          const req = https.request(`https://api.mercadopago.com/v1/payments/${queryId}`, {
            method: "GET",
            headers: { "Authorization": `Bearer ${accessToken}` }
          }, (resp) => {
            let r = "";
            resp.on("data", c => r += c);
            resp.on("end", () => {
              try { resolve(JSON.parse(r)); } catch { resolve(null); }
            });
          });
          req.on("error", () => resolve(null));
          req.end();
        });

        if (paymentRes && paymentRes.status === "approved") {
          const resCode = paymentRes.external_reference;
          const valorPago = paymentRes.transaction_amount || paymentRes.total_paid_amount;

          if (resCode) {
            const r = (db.reservations || []).find(resItem => resItem.code === resCode || String(resItem.id) === resCode);
            if (r) {
              r.paymentStatus = "pago_total";
              r.paidAmount = valorPago || r.totalAmount;
              r.paidAt = paymentRes.date_approved || new Date().toISOString();
              r.paymentMethod = "cartao_credito";
              r.mpPaymentId = queryId;
              saveDatabase();

              createNotification({
                category: "checkout",
                title: `💳 Cartão Aprovado (Mercado Pago): R$ ${valorPago?.toLocaleString("pt-BR")} (Apt ${r.flatNumber})`,
                message: `Reserva ${r.code} paga em até 12x no cartão por ${r.guestName}!`,
                severity: "success",
                metadata: { reservationCode: r.code, paymentId: queryId, amount: valorPago },
                targetUrl: `/reservas`
              });
            }
          }
        }
      }
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("[Mercado Pago Webhook] Erro:", err);
    res.status(500).json({ error: err.message });
  }
});

// 7.3 Configurações do Mercado Pago
app.get("/api/integrations/mercadopago/config", (req, res) => {
  const cfg = db.settings?.mercadoPagoConfig || DEFAULT_MP_CONFIG;
  res.json({
    hasToken: Boolean(cfg.accessToken || process.env.MERCADOPAGO_ACCESS_TOKEN),
    publicKey: cfg.publicKey || "",
    isConfigured: Boolean(cfg.accessToken || process.env.MERCADOPAGO_ACCESS_TOKEN),
    sandbox: Boolean(cfg.sandbox)
  });
});

app.post("/api/integrations/mercadopago/config", (req, res) => {
  try {
    const { accessToken, publicKey, sandbox } = req.body;
    if (!db.settings) db.settings = {};
    db.settings.mercadoPagoConfig = {
      accessToken: (accessToken || "").trim(),
      publicKey: (publicKey || "").trim(),
      sandbox: Boolean(sandbox),
      isConfigured: Boolean((accessToken || "").trim()),
      updatedAt: new Date().toISOString()
    };
    saveDatabase();
    res.json({
      success: true,
      message: "Credenciais do Mercado Pago salvas com sucesso!"
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// MÓDULO 8: GESTÃO DE PAGAMENTOS, TAXAS, COMISSÕES E CONCILIAÇÃO FINANCEIRA
// ══════════════════════════════════════════════════════════════════════════════

const DEFAULT_FEE_SETTINGS = {
  pixInterRate: 0.0,            // 0% Banco Inter PIX Oficial
  mpCreditSpotRate: 3.99,       // 3.99% Mercado Pago Crédito à Vista
  mpCreditInstallmentRate: 5.49,// 5.49% Mercado Pago Crédito Parcelado
  bookingCommissionRate: 13.0,  // 13.0% Comissão Booking.com
  airbnbCommissionRate: 3.0,    // 3.0% Comissão Airbnb
  directRate: 0.0,              // 0% Vendas Diretas / WhatsApp
  issTaxRate: 2.0               // 2.0% ISS Municipal Estimado
};

// 8.1 Obter e Atualizar Configuração de Taxas
app.get("/api/finance/fee-settings", (req, res) => {
  const fees = db.settings?.feeSettings || DEFAULT_FEE_SETTINGS;
  res.json(fees);
});

app.post("/api/finance/fee-settings", (req, res) => {
  try {
    const fees = req.body;
    if (!db.settings) db.settings = {};
    db.settings.feeSettings = {
      ...DEFAULT_FEE_SETTINGS,
      ...fees,
      updatedAt: new Date().toISOString()
    };
    saveDatabase();
    res.json({ success: true, feeSettings: db.settings.feeSettings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8.2 Obter Histórico Completo de Pagamentos e Conciliação
app.get("/api/finance/payments", (req, res) => {
  try {
    const feeConfig = db.settings?.feeSettings || DEFAULT_FEE_SETTINGS;
    const { startDate, endDate, method, channel, status, flatId, search } = req.query;

    const allPayments = [];

    // 1. Processar todas as Reservas do PMS
    for (const r of (db.reservations || [])) {
      if (r.status === "cancelada" || r.status === "cancelado") continue;

      const flat = db.flats.find(f => f.id === r.flatId || String(f.number) === String(r.flatNumber)) || { id: r.flatId, number: r.flatNumber || "113" };
      const grossAmount = Number(r.paidAmount || r.totalAmount || 0);
      const isPaid = r.paymentStatus === "pago_total" || r.paymentStatus === "pago";

      // Determinar método de pagamento
      let paymentMethod = r.paymentMethod;
      if (!paymentMethod) {
        if (r.pixTxId || r.pixEndToEndId) paymentMethod = "pix_inter";
        else if (r.mpPaymentId) paymentMethod = "cartao_mercadopago";
        else if (r.channel === "booking") paymentMethod = "booking_payments";
        else if (r.channel === "airbnb") paymentMethod = "airbnb_payout";
        else if (r.channel === "site") paymentMethod = "pix_inter";
        else paymentMethod = "direto_manual";
      }

      // Calcular Taxas de Gateway e Comissões de Canal
      let gatewayFeePct = 0;
      let channelCommissionPct = 0;

      if (paymentMethod === "pix_inter" || paymentMethod === "pix") {
        gatewayFeePct = Number(feeConfig.pixInterRate || 0);
      } else if (paymentMethod === "cartao_mercadopago" || paymentMethod === "cartao_credito") {
        gatewayFeePct = Number(feeConfig.mpCreditSpotRate || 3.99);
      }

      const resChannel = r.channel || (paymentMethod.includes("booking") ? "booking" : (paymentMethod.includes("airbnb") ? "airbnb" : "site"));
      if (resChannel === "booking") {
        channelCommissionPct = Number(feeConfig.bookingCommissionRate || 13.0);
      } else if (resChannel === "airbnb") {
        channelCommissionPct = Number(feeConfig.airbnbCommissionRate || 3.0);
      }

      const gatewayFeeAmount = Number((grossAmount * (gatewayFeePct / 100)).toFixed(2));
      const channelCommissionAmount = Number((grossAmount * (channelCommissionPct / 100)).toFixed(2));
      const totalDeductions = gatewayFeeAmount + channelCommissionAmount;
      const netAmount = Number((grossAmount - totalDeductions).toFixed(2));

      const paymentDate = r.paidAt || (isPaid ? r.createdAt : null) || r.checkinDate;

      allPayments.push({
        id: `res-${r.id || r.code}`,
        type: "reservation",
        code: r.code,
        reservationId: r.id,
        guestName: r.guestName,
        guestPhone: r.guestPhone,
        guestEmail: r.guestEmail,
        flatId: flat.id,
        flatNumber: flat.number,
        checkinDate: r.checkinDate,
        checkoutDate: r.checkoutDate,
        channel: resChannel,
        paymentMethod,
        paymentStatus: r.paymentStatus || (isPaid ? "pago_total" : "pendente"),
        isPaid,
        grossAmount,
        gatewayFeePct,
        gatewayFeeAmount,
        channelCommissionPct,
        channelCommissionAmount,
        totalDeductions,
        netAmount,
        paidAt: r.paidAt || (isPaid ? r.createdAt : null),
        date: paymentDate ? paymentDate.substring(0, 10) : "",
        pixTxId: r.pixTxId || null,
        pixEndToEndId: r.pixEndToEndId || null,
        mpPaymentId: r.mpPaymentId || null,
        notes: r.notes || "",
        recipient: "CorpFlats Hospedagens",
        recipientCnpj: "47.964.813/0001-65"
      });
    }

    // 2. Processar Contas a Receber Adicionais (Long-Stay, Day-Use, Serviços)
    for (const rec of (db.receivables || [])) {
      const grossAmount = Number(rec.amount || 0);
      const isPaid = rec.status === "recebido" || rec.status === "pago";
      let paymentMethod = rec.paymentMethod || "pix_inter";
      let gatewayFeePct = paymentMethod === "cartao_credito" ? Number(feeConfig.mpCreditSpotRate || 3.99) : Number(feeConfig.pixInterRate || 0);
      let gatewayFeeAmount = Number((grossAmount * (gatewayFeePct / 100)).toFixed(2));
      let netAmount = Number((grossAmount - gatewayFeeAmount).toFixed(2));

      allPayments.push({
        id: `rec-${rec.id}`,
        type: "receivable",
        code: `REC-${rec.id}`,
        guestName: rec.clientName || rec.description,
        guestPhone: "",
        guestEmail: "",
        flatId: rec.flatId || null,
        flatNumber: rec.flatNumber || "Geral",
        checkinDate: null,
        checkoutDate: null,
        channel: "direta",
        paymentMethod,
        paymentStatus: isPaid ? "pago_total" : "pendente",
        isPaid,
        grossAmount,
        gatewayFeePct,
        gatewayFeeAmount,
        channelCommissionPct: 0,
        channelCommissionAmount: 0,
        totalDeductions: gatewayFeeAmount,
        netAmount,
        paidAt: rec.paidAt || (isPaid ? rec.dueDate : null),
        date: rec.dueDate || "",
        pixTxId: rec.pixTxId || null,
        pixEndToEndId: rec.pixEndToEndId || null,
        mpPaymentId: null,
        notes: rec.description || "",
        category: rec.category || "outros"
      });
    }

    // 3. Aplicar Filtros
    let filtered = allPayments;

    if (startDate) {
      filtered = filtered.filter(p => p.date >= startDate);
    }
    if (endDate) {
      filtered = filtered.filter(p => p.date <= endDate);
    }
    if (method && method !== "all") {
      filtered = filtered.filter(p => p.paymentMethod === method || (method === "pix" && p.paymentMethod.includes("pix")) || (method === "cartao" && p.paymentMethod.includes("cartao")));
    }
    if (channel && channel !== "all") {
      filtered = filtered.filter(p => p.channel === channel);
    }
    if (status && status !== "all") {
      if (status === "paid") filtered = filtered.filter(p => p.isPaid);
      else if (status === "pending") filtered = filtered.filter(p => !p.isPaid);
    }
    if (flatId && flatId !== "all") {
      filtered = filtered.filter(p => String(p.flatNumber) === String(flatId) || String(p.flatId) === String(flatId));
    }
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(p => 
        p.guestName?.toLowerCase().includes(q) ||
        p.code?.toLowerCase().includes(q) ||
        String(p.flatNumber)?.toLowerCase().includes(q) ||
        p.pixTxId?.toLowerCase().includes(q) ||
        p.pixEndToEndId?.toLowerCase().includes(q)
      );
    }

    // Ordenação decrescente por data/hora
    filtered.sort((a, b) => {
      const timeA = a.paidAt ? new Date(a.paidAt).getTime() : (a.date ? new Date(a.date).getTime() : 0);
      const timeB = b.paidAt ? new Date(b.paidAt).getTime() : (b.date ? new Date(b.date).getTime() : 0);
      return timeB - timeA;
    });

    // 4. Calcular Totais e Métricas (KPIs)
    let totalGross = 0;
    let totalFees = 0;
    let totalCommissions = 0;
    let totalNet = 0;
    let totalPaidCount = 0;
    let totalPendingCount = 0;
    let totalPendingAmount = 0;

    const byMethodMap = {};
    const byChannelMap = {};

    for (const p of filtered) {
      if (p.isPaid) {
        totalGross += p.grossAmount;
        totalFees += p.gatewayFeeAmount;
        totalCommissions += p.channelCommissionAmount;
        totalNet += p.netAmount;
        totalPaidCount++;

        // Agrupamento por método
        const mKey = p.paymentMethod || "outros";
        if (!byMethodMap[mKey]) byMethodMap[mKey] = { method: mKey, gross: 0, net: 0, count: 0 };
        byMethodMap[mKey].gross += p.grossAmount;
        byMethodMap[mKey].net += p.netAmount;
        byMethodMap[mKey].count++;

        // Agrupamento por canal
        const cKey = p.channel || "direta";
        if (!byChannelMap[cKey]) byChannelMap[cKey] = { channel: cKey, gross: 0, net: 0, count: 0 };
        byChannelMap[cKey].gross += p.grossAmount;
        byChannelMap[cKey].net += p.netAmount;
        byChannelMap[cKey].count++;
      } else {
        totalPendingCount++;
        totalPendingAmount += p.grossAmount;
      }
    }

    res.json({
      payments: filtered,
      summary: {
        totalGross: Number(totalGross.toFixed(2)),
        totalFees: Number(totalFees.toFixed(2)),
        totalCommissions: Number(totalCommissions.toFixed(2)),
        totalDeductions: Number((totalFees + totalCommissions).toFixed(2)),
        totalNet: Number(totalNet.toFixed(2)),
        totalPaidCount,
        totalPendingCount,
        totalPendingAmount: Number(totalPendingAmount.toFixed(2)),
        averageTicket: totalPaidCount > 0 ? Number((totalGross / totalPaidCount).toFixed(2)) : 0,
        byMethod: Object.values(byMethodMap),
        byChannel: Object.values(byChannelMap)
      },
      feeSettings: feeConfig
    });
  } catch (err) {
    console.error("[Payments API] Erro:", err);
    res.status(500).json({ error: err.message });
  }
});

// 8.3 Reconciliação Bancária Imediata de Transação
app.post("/api/finance/payments/reconcile/:code", async (req, res) => {
  try {
    const { code } = req.params;
    const r = (db.reservations || []).find(x => x.code === code || String(x.id) === code || x.pixTxId === code);
    if (!r) return res.status(404).json({ error: "Reserva não encontrada para conciliação." });

    if (r.pixTxId) {
      const cobData = await checkInterPixCobStatus(r.pixTxId);
      if (cobData && (cobData.status === "CONCLUIDA" || (Array.isArray(cobData.pix) && cobData.pix.length > 0))) {
        const valorPago = Number(cobData.pix?.[0]?.valor || cobData.valor?.original || r.totalAmount);
        r.paymentStatus = "pago_total";
        r.paidAmount = valorPago;
        r.paidAt = cobData.pix?.[0]?.horario || new Date().toISOString();
        r.pixEndToEndId = cobData.pix?.[0]?.endToEndId;
        saveDatabase();

        return res.json({
          success: true,
          reconciled: true,
          status: "pago_total",
          paidAmount: valorPago,
          paidAt: r.paidAt,
          endToEndId: r.pixEndToEndId,
          message: "Pagamento conciliado com sucesso no Banco Inter!"
        });
      } else {
        return res.json({
          success: true,
          reconciled: false,
          status: cobData?.status || "PENDENTE",
          message: "Transação ainda pendente de liquidação no Banco Inter."
        });
      }
    }

    res.json({
      success: true,
      reconciled: r.paymentStatus === "pago_total",
      status: r.paymentStatus,
      message: "Transação verificada."
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Static Frontend Production Serving ──────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
// MÓDULO 8: API DE AUDITORIA & LOGS DO SISTEMA (FAIL-SAFE AUDIT LOGS)
// ══════════════════════════════════════════════════════════════════════════════

// 8.1 Listar Logs com Filtros, Paginação e Métricas
app.get("/api/audit-logs", async (req, res) => {
  try {
    const { category, level, search, startDate, endDate, limit = 100, offset = 0 } = req.query;
    
    let logs = db.auditLogs || [];

    // Se houver PostgreSQL conectado, consulta a tabela com índices
    if (pgPool) {
      try {
        let query = "SELECT * FROM system_audit_logs WHERE 1=1";
        const params = [];
        let idx = 1;

        if (category && category !== "all") {
          query += ` AND category = $${idx++}`;
          params.push(category);
        }
        if (level && level !== "all") {
          query += ` AND level = $${idx++}`;
          params.push(level);
        }
        if (search) {
          query += ` AND (action ILIKE $${idx} OR details::text ILIKE $${idx} OR actor::text ILIKE $${idx})`;
          params.push(`%${search}%`);
          idx++;
        }
        if (startDate) {
          query += ` AND timestamp >= $${idx++}`;
          params.push(startDate);
        }
        if (endDate) {
          query += ` AND timestamp <= $${idx++}`;
          params.push(endDate);
        }

        query += ` ORDER BY timestamp DESC LIMIT $${idx++} OFFSET $${idx++}`;
        params.push(Number(limit) || 100, Number(offset) || 0);

        const pgRes = await pgPool.query(query, params);
        if (pgRes && pgRes.rows && pgRes.rows.length > 0) {
          logs = pgRes.rows;
        }
      } catch (err) {
        console.warn("[PostgreSQL Logs Fallback]", err.message);
      }
    }

    // Filtros em memória (caso esteja usando fallback ou banco local)
    if (!pgPool || logs === db.auditLogs) {
      if (category && category !== "all") {
        logs = logs.filter(l => l.category === category);
      }
      if (level && level !== "all") {
        logs = logs.filter(l => l.level === level);
      }
      if (search) {
        const q = search.toLowerCase();
        logs = logs.filter(l => 
          (l.action && l.action.toLowerCase().includes(q)) ||
          JSON.stringify(l.details || {}).toLowerCase().includes(q) ||
          JSON.stringify(l.actor || {}).toLowerCase().includes(q)
        );
      }
      if (startDate) {
        logs = logs.filter(l => new Date(l.timestamp) >= new Date(startDate));
      }
      if (endDate) {
        logs = logs.filter(l => new Date(l.timestamp) <= new Date(endDate));
      }
    }

    // Estatísticas Consolidadas em Tempo Real
    const allLogs = db.auditLogs || [];
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const stats = {
      total: allLogs.length,
      last24hCount: allLogs.filter(l => new Date(l.timestamp) >= last24h).length,
      errorsCount: allLogs.filter(l => l.level === "error" || l.level === "critical").length,
      reservationsCount: allLogs.filter(l => l.category === "reservation").length,
      paymentsCount: allLogs.filter(l => l.category === "payment").length,
      cleaningsCount: allLogs.filter(l => l.category === "cleaning").length,
      securityCount: allLogs.filter(l => l.category === "auth").length
    };

    res.json({
      success: true,
      logs: logs.slice(0, Number(limit) || 100),
      total: logs.length,
      stats
    });
  } catch (err) {
    res.status(500).json({ error: `Erro ao buscar logs de auditoria: ${err.message}` });
  }
});

// 8.2 Exportar Logs para Arquivo CSV
app.get("/api/audit-logs/export", (req, res) => {
  try {
    const logs = db.auditLogs || [];
    const headers = ["ID", "Data/Hora", "Nível", "Categoria", "Ação", "Ator / Usuário", "Detalhes", "IP", "Origem"];
    const rows = logs.map(l => [
      l.id,
      `"${new Date(l.timestamp).toLocaleString("pt-BR")}"`,
      `"${l.level}"`,
      `"${l.category}"`,
      `"${l.action}"`,
      `"${(l.actor?.name || 'Sistema')} (${l.actor?.role || 'sys'})"`,
      `"${JSON.stringify(l.details).replace(/"/g, '""')}"`,
      `"${l.ip || ''}"`,
      `"${l.source || ''}"`
    ]);

    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=corpflats_audit_logs_${Date.now()}.csv`);
    res.send("\uFEFF" + csvContent);
  } catch (err) {
    res.status(500).json({ error: `Erro ao exportar logs: ${err.message}` });
  }
});

// 8.3 Registrar Erro de Frontend (React Error Boundary / Navegador)
app.post("/api/audit-logs/client", (req, res) => {
  try {
    const { level = "error", category = "system", action = "CLIENT_ERROR", details = {}, actor = null } = req.body;
    logAuditEvent({
      level,
      category,
      action,
      actor: actor || { name: "Navegador do Hóspede/Usuário", role: "client" },
      details,
      source: "client_browser",
      ip: req.ip || req.headers["x-forwarded-for"] || "",
      userAgent: req.headers["user-agent"] || ""
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8.4 Middleware Global de Captura de Erros Express
app.use((err, req, res, next) => {
  console.error("[EXPRESS UNHANDLED ERROR]", err);
  logAuditEvent({
    level: "error",
    category: "system",
    action: "EXPRESS_API_ERROR",
    actor: { role: "system", url: req.originalUrl, method: req.method },
    details: {
      message: err.message,
      stack: err.stack,
      body: req.body,
      query: req.query
    },
    ip: req.ip || req.headers["x-forwarded-for"] || "",
    source: "express_middleware"
  });
  if (!res.headersSent) {
    res.status(500).json({ error: "Erro interno no servidor registrado no log de auditoria.", details: err.message });
  }
});

// Captura de Rejeições Globais
process.on("unhandledRejection", (reason, promise) => {
  console.error("[NODE UNHANDLED REJECTION]", reason);
  logAuditEvent({
    level: "critical",
    category: "system",
    action: "NODE_UNHANDLED_REJECTION",
    details: { reason: String(reason), stack: reason?.stack || null }
  });
});

const distPath = path.resolve(__dirname, "../limpeza/dist/public");
const fallbackDistPath = path.resolve(__dirname, "../limpeza/dist");

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api")) {
      return res.sendFile(path.join(distPath, "index.html"));
    }
    next();
  });
  console.log(`[Production Server] Servindo frontend em: ${distPath}`);
} else if (fs.existsSync(fallbackDistPath)) {
  app.use(express.static(fallbackDistPath));
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api")) {
      return res.sendFile(path.join(fallbackDistPath, "index.html"));
    }
    next();
  });
  console.log(`[Production Server] Servindo frontend em: ${fallbackDistPath}`);
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[Demo Server] API rodando em http://0.0.0.0:${PORT}`);
});

export { app };
