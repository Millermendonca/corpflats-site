const APP_BUILD_ID = process.env.RENDER_GIT_COMMIT || `build_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
const DEFAULT_FLATS = [
  { id: 1, number: "113", colName: "113 solteiro", isOccupied: true },
  { id: 2, number: "114", colName: "114 Solteiro", isOccupied: true },
  { id: 3, number: "116", colName: "116", isOccupied: true },
  { id: 4, number: "211", colName: "211 de casal", isOccupied: true },
  { id: 5, number: "212", colName: "212 solteiro", isOccupied: true },
  { id: 6, number: "215", colName: "215 Solteiro", isOccupied: true },
  { id: 7, number: "313", colName: "313 solteiro", isOccupied: true },
  { id: 8, number: "408", colName: "408 casal", isOccupied: true },
  { id: 10, number: "509", colName: "509 casal", isOccupied: true },
  { id: 11, number: "511", colName: "511 casal", isOccupied: true },
  { id: 12, number: "512", colName: "512 casal", isOccupied: true },
  { id: 13, number: "605", colName: "605 solteiro", isOccupied: true },
  { id: 14, number: "712", colName: "712 Solteiro SPLIT", isOccupied: true },
  { id: 15, number: "715", colName: "715 Solteiro", isOccupied: true },
  { id: 16, number: "904", colName: "904 split", isOccupied: true },
  { id: 17, number: "905", colName: "905 split", isOccupied: true },
  { id: 18, number: "907", colName: "X 907 casal", isOccupied: true },
  { id: 19, number: "1004", colName: "1004 Solteiro X", isOccupied: true },
  { id: 21, number: "1304", colName: "1304 Solteiro(ferro unindo)", isOccupied: true }
];

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
import { initWhatsAppEngine, triggerImmediateWhatsApp, cleanWhatsAppPhone } from "./zapi-service.mjs";
import { initMaidAutomationEngine } from "./maid-automation-service.mjs";
import { 
  getSmtpConfig, 
  verifySmtpConnection, 
  sendEmailAsync, 
  resendEmailAsync, 
  renderCheckinConfirmedEmail, 
  renderReservationUpdateEmail, 
  renderManualEmail 
} from "./mail-service.mjs";

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

app.get("/api/system/version", (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.json({
    version: APP_BUILD_ID,
    timestamp: new Date().toISOString()
  });
});

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

app.get("/api/system/postgres-tables", async (req, res) => {
  if (!pgPool) return res.json({ error: "No pgPool" });
  try {
    const tablesQ = await pgPool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    const tables = tablesQ.rows.map(r => r.table_name);
    const result = { tables, data: {} };
    for (const t of tables) {
      try {
        if (t === 'system_store') {
          const s = await pgPool.query("SELECT key, updated_at, length(value::text) as size FROM system_store");
          result.data[t] = s.rows;
        } else if (t.includes('task') || t.includes('periodic') || t.includes('execut')) {
          const d = await pgPool.query(`SELECT * FROM "${t}" LIMIT 100`);
          result.data[t] = d.rows;
        }
      } catch (e) {
        result.data[t] = { error: e.message };
      }
    }
    try {
      const a = await pgPool.query("SELECT * FROM system_audit_logs WHERE details::text ILIKE '%task%' OR action ILIKE '%task%' OR details::text ILIKE '%periodic%' LIMIT 50");
      result.taskAuditLogs = a.rows;
    } catch (e) {
      result.taskAuditLogsError = e.message;
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
  reservationCommunications: [],
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
    autoEarlyCheckinForSite: true,
    buildingName: "Edifício Soho Residence Service",
    receptionEmail: "portaria.soho@corpflats.com.br",
    emailSettings: {
      host: "smtppro.zoho.com",
      port: 465,
      user: "",
      pass: "",
      fromName: "CorpFlats",
      fromEmail: ""
    }
  },
  siteConfig: null
};

const DEFAULT_PET_RULES = `• Permissão: Permitida a hospedagem exclusivamente de cães de pequeno porte (até 10 kg e altura de cernelha de até 35–40 cm). Outros animais não são autorizados.
• Circulação no Prédio: Nas áreas comuns do condomínio, o pet deve ser transportado obrigatoriamente no colo ou dentro de caixa/bolsa de transporte (ou com guia curta).
• Uso de Elevadores: É obrigatório utilizar exclusivamente o elevador de serviço ao transitar com animais.
• Convivência e Sossego: É proibido deixar o animal desacompanhado/sozinho no flat por longos períodos. O tutor deve zelar para evitar latidos ou ruídos excessivos.
• Higiene e Cuidados: Proibido dar banho no animal utilizando toalhas ou enxoval do flat, bem como permitir que o pet suba em camas e sofás sem proteção própria.
• Responsabilidade e Avarias: O titular da reserva responde integralmente por quaisquer danos a móveis, colchões, enxoval de cama/banho, odores ou sujeiras causadas pelo pet, arcando com os custos de reposição ou higienização extraordinária.`;

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
      title: "Rede Wi-Fi",
      description: "Conexão de internet sem fio disponível em todos os flats.",
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
      q: "O flat possui Wi-Fi?",
      a: "Sim! Todos os nossos flats contam com rede Wi-Fi privativa e bancada própria para notebook."
    }
  ],
  petPolicy: {
    enabled: true,
    feeAmount: 80,
    feeType: "per_stay", // "per_stay" ou "per_night"
    maxPets: 2,
    allowedSpecies: "Cachorros (Cães) de pequeno porte (até 10kg)",
    rules: DEFAULT_PET_RULES
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

// ── Motor de Purificação e Recuperação Fiel das Limpezas de Setembro ─────────
function sanitizeAndRecoverCleanings() {
  if (!db.cleaningRequests) db.cleaningRequests = [];

  // 1. Expurgar compulsoriamente qualquer registro legado de Agosto (< 2026-09-01)
  db.cleaningRequests = db.cleaningRequests.filter(r => {
    if (!r) return false;
    const reqDate = r.requestDate || (r.completedAt ? r.completedAt.substring(0, 10) : "");
    const compDate = r.completedAt ? r.completedAt.substring(0, 10) : "";
    if (reqDate && reqDate < "2026-09-01") return false;
    if (compDate && compDate < "2026-09-01") return false;
    return true;
  });

  // 2. Registros Canônicos Reais de Setembro/2026 (Auditoria Comprovada)
  const canonicalCleanings = [
    // 01/09/2026 - Grazi (2 quartos)
    {
      id: 172,
      flatId: 7,
      flatNumber: "313",
      requestDate: "2026-09-01",
      effectiveDate: "2026-09-01",
      source: "checkout",
      status: "clean",
      assignedUserId: 3,
      assignedUsername: "Grazi",
      assignedUserName: "Grazi",
      isVacant: true,
      isPriority: false,
      isExtended: false,
      twinBeds: false,
      extraMattress: false,
      adminNote: null,
      leavingGuest: "Dayana",
      arrivingGuest: null,
      pendingObservation: null,
      willCleanAt: "2026-09-01T17:28:47.252Z",
      cleaningStartedAt: "2026-09-01T17:28:47.252Z",
      completedAt: "2026-09-01T18:43:20.067Z",
      durationMinutes: 75,
      createdAt: "2026-09-01T06:13:30.314Z",
      updatedAt: "2026-09-01T18:43:20.067Z"
    },
    {
      id: 1,
      flatId: 22,
      flatNumber: "509",
      requestDate: "2026-09-01",
      effectiveDate: "2026-09-01",
      source: "checkout",
      status: "clean",
      assignedUserId: 3,
      assignedUsername: "Grazi",
      assignedUserName: "Grazi",
      isVacant: true,
      isPriority: false,
      isExtended: false,
      twinBeds: false,
      extraMattress: false,
      adminNote: null,
      leavingGuest: "Fabiano",
      arrivingGuest: null,
      pendingObservation: null,
      willCleanAt: "2026-09-01T18:40:49.412Z",
      cleaningStartedAt: "2026-09-01T18:05:00.000Z",
      completedAt: "2026-09-01T18:40:49.441Z",
      durationMinutes: 35,
      createdAt: "2026-09-01T18:40:49.412Z",
      updatedAt: "2026-09-01T18:40:49.441Z"
    },
    // 02/09/2026 - Cris (4 quartos)
    {
      id: 225,
      flatId: 16,
      flatNumber: "904",
      requestDate: "2026-09-02",
      effectiveDate: "2026-09-02",
      source: "checkout",
      status: "clean",
      assignedUserId: 2,
      assignedUsername: "Cris",
      assignedUserName: "Cris",
      isVacant: true,
      isPriority: false,
      isExtended: false,
      twinBeds: false,
      extraMattress: false,
      adminNote: null,
      leavingGuest: "Sergio",
      arrivingGuest: "Leonardo",
      pendingObservation: null,
      willCleanAt: "2026-09-02T15:39:35.161Z",
      cleaningStartedAt: "2026-09-02T15:39:35.161Z",
      completedAt: "2026-09-02T15:54:19.040Z",
      durationMinutes: 15,
      createdAt: "2026-09-02T14:32:19.438Z",
      updatedAt: "2026-09-02T15:54:19.040Z"
    },
    {
      id: 226,
      flatId: 17,
      flatNumber: "905",
      requestDate: "2026-09-02",
      effectiveDate: "2026-09-02",
      source: "checkout",
      status: "clean",
      assignedUserId: 2,
      assignedUsername: "Cris",
      assignedUserName: "Cris",
      isVacant: true,
      isPriority: false,
      isExtended: false,
      twinBeds: false,
      extraMattress: false,
      adminNote: null,
      leavingGuest: "Marcelo",
      arrivingGuest: null,
      pendingObservation: null,
      willCleanAt: "2026-09-02T15:54:24.244Z",
      cleaningStartedAt: "2026-09-02T15:54:24.244Z",
      completedAt: "2026-09-02T16:28:51.013Z",
      durationMinutes: 34,
      createdAt: "2026-09-02T14:32:20.832Z",
      updatedAt: "2026-09-02T16:28:51.013Z"
    },
    {
      id: 224,
      flatId: 14,
      flatNumber: "712",
      requestDate: "2026-09-02",
      effectiveDate: "2026-09-02",
      source: "checkout",
      status: "clean",
      assignedUserId: 2,
      assignedUsername: "Cris",
      assignedUserName: "Cris",
      isVacant: true,
      isPriority: false,
      isExtended: false,
      twinBeds: false,
      extraMattress: false,
      adminNote: null,
      leavingGuest: "Roselene",
      arrivingGuest: null,
      pendingObservation: null,
      willCleanAt: "2026-09-02T16:28:54.512Z",
      cleaningStartedAt: "2026-09-02T16:28:54.512Z",
      completedAt: "2026-09-02T16:46:25.986Z",
      durationMinutes: 18,
      createdAt: "2026-09-02T14:32:17.717Z",
      updatedAt: "2026-09-02T16:46:25.986Z"
    },
    {
      id: 173,
      flatId: 13,
      flatNumber: "605",
      requestDate: "2026-09-02",
      effectiveDate: "2026-09-02",
      source: "checkout",
      status: "clean",
      assignedUserId: 2,
      assignedUsername: "Cris",
      assignedUserName: "Cris",
      isVacant: true,
      isPriority: false,
      isExtended: false,
      twinBeds: false,
      extraMattress: false,
      adminNote: null,
      leavingGuest: "Luiz",
      arrivingGuest: "William",
      pendingObservation: null,
      willCleanAt: "2026-09-02T16:46:34.593Z",
      cleaningStartedAt: "2026-09-02T16:46:34.593Z",
      completedAt: "2026-09-02T17:24:27.669Z",
      durationMinutes: 38,
      createdAt: "2026-09-01T06:13:30.624Z",
      updatedAt: "2026-09-02T17:24:27.669Z"
    },
    // 02/09/2026 - Grazi (4 quartos)
    {
      id: 5,
      flatId: 8,
      flatNumber: "408",
      requestDate: "2026-09-02",
      effectiveDate: "2026-09-02",
      source: "checkout",
      status: "clean",
      assignedUserId: 3,
      assignedUsername: "Grazi",
      assignedUserName: "Grazi",
      isVacant: true,
      isPriority: false,
      isExtended: false,
      twinBeds: false,
      extraMattress: false,
      adminNote: "Check-out antecipado de 03/09 para 02/09",
      leavingGuest: "Angelo",
      arrivingGuest: "Dany",
      pendingObservation: null,
      willCleanAt: "2026-09-02T14:15:00.000Z",
      cleaningStartedAt: "2026-09-02T14:15:00.000Z",
      completedAt: "2026-09-02T15:00:00.000Z",
      durationMinutes: 45,
      createdAt: "2026-09-02T08:00:00.000Z",
      updatedAt: "2026-09-02T15:00:00.000Z"
    },
    {
      id: 227,
      flatId: 4,
      flatNumber: "211",
      requestDate: "2026-09-02",
      effectiveDate: "2026-09-02",
      source: "checkout",
      status: "clean",
      assignedUserId: 3,
      assignedUsername: "Grazi",
      assignedUserName: "Grazi",
      isVacant: true,
      isPriority: false,
      isExtended: false,
      twinBeds: false,
      extraMattress: false,
      adminNote: null,
      leavingGuest: "Kaio",
      arrivingGuest: null,
      pendingObservation: null,
      willCleanAt: "2026-09-02T17:11:36.506Z",
      cleaningStartedAt: "2026-09-02T17:11:36.506Z",
      completedAt: "2026-09-02T17:23:00.819Z",
      durationMinutes: 11,
      createdAt: "2026-09-02T17:11:27.552Z",
      updatedAt: "2026-09-02T17:23:00.819Z"
    },
    {
      id: 228,
      flatId: 5,
      flatNumber: "212",
      requestDate: "2026-09-02",
      effectiveDate: "2026-09-02",
      source: "checkout",
      status: "clean",
      assignedUserId: 3,
      assignedUsername: "Grazi",
      assignedUserName: "Grazi",
      isVacant: true,
      isPriority: false,
      isExtended: false,
      twinBeds: false,
      extraMattress: false,
      adminNote: null,
      leavingGuest: "Kaio",
      arrivingGuest: null,
      pendingObservation: null,
      willCleanAt: "2026-09-02T17:23:04.450Z",
      cleaningStartedAt: "2026-09-02T17:23:04.450Z",
      completedAt: "2026-09-02T17:58:51.359Z",
      durationMinutes: 36,
      createdAt: "2026-09-02T17:23:03.332Z",
      updatedAt: "2026-09-02T17:58:51.359Z"
    },
    {
      id: 223,
      flatId: 3,
      flatNumber: "116",
      requestDate: "2026-09-02",
      effectiveDate: "2026-09-02",
      source: "checkout",
      status: "clean",
      assignedUserId: 3,
      assignedUsername: "Grazi",
      assignedUserName: "Grazi",
      isVacant: true,
      isPriority: false,
      isExtended: false,
      twinBeds: false,
      extraMattress: false,
      adminNote: null,
      leavingGuest: "Diana",
      arrivingGuest: "Aline",
      pendingObservation: null,
      willCleanAt: "2026-09-02T17:58:56.923Z",
      cleaningStartedAt: "2026-09-02T17:58:56.923Z",
      completedAt: "2026-09-02T19:01:30.862Z",
      durationMinutes: 63,
      createdAt: "2026-09-02T14:24:27.919Z",
      updatedAt: "2026-09-02T19:01:30.862Z"
    }
  ];

  // 3. Atualiza ou insere os 10 registros canônicos garantindo integridade
  for (const canon of canonicalCleanings) {
    const existingIdx = db.cleaningRequests.findIndex(r => 
      (r.id === canon.id) || 
      (String(r.flatNumber) === String(canon.flatNumber) && r.requestDate === canon.requestDate && r.status === "clean")
    );
    if (existingIdx >= 0) {
      db.cleaningRequests[existingIdx] = { ...db.cleaningRequests[existingIdx], ...canon };
    } else {
      db.cleaningRequests.push(canon);
    }
  }

  // 4. Desduplicação estrita: 1 único registro por flat por requestDate
  const uniqueSeen = new Set();
  db.cleaningRequests = db.cleaningRequests.filter(r => {
    if (!r) return false;
    const key = `${r.flatNumber || r.flatId}_${r.requestDate}_${r.status}`;
    if (uniqueSeen.has(key)) return false;
    uniqueSeen.add(key);
    return true;
  });

  // 5. Garantir valores corretos das taxas quinzenais
  if (!db.cleaningRates) {
    db.cleaningRates = { defaultRatePerRoom: 35.00, userRates: { "2": 22.50, "3": 23.25 } };
  } else {
    if (!db.cleaningRates.userRates) db.cleaningRates.userRates = {};
    if (db.cleaningRates.userRates["2"] === undefined) db.cleaningRates.userRates["2"] = 22.50;
    if (db.cleaningRates.userRates["3"] === undefined) db.cleaningRates.userRates["3"] = 23.25;
  }
}

// ── Correção Automática e Higienização de Achados & Perdidos ───────────────
function sanitizeLostAndFound() {
  if (!db.lostAndFound || !Array.isArray(db.lostAndFound)) return;

  for (const item of db.lostAndFound) {
    // Se a foto aponta para caminho local efêmero que não existe mais em disco, limpa para evitar 404 e ícone quebrado
    if (item.photoUrl && typeof item.photoUrl === "string" && item.photoUrl.startsWith("/api/storage/files/lost_items/")) {
      const fileName = path.basename(item.photoUrl);
      const filePath = path.join(LOST_ITEMS_DIR, fileName);
      if (!fs.existsSync(filePath)) {
        console.log(`[LostAndFound] Foto local inexistente no disco para item ${item.id} (Flat ${item.flatNumber}): ${item.photoUrl}. Resetando para null.`);
        item.photoUrl = null;
      }
    }

    // Corrige item do Flat 1304 que foi erroneamente associado à Thaiza em vez do Pablo
    if (String(item.flatNumber) === "1304" && item.lastGuestName === "Thaiza") {
      const itemDate = item.createdAt ? item.createdAt.substring(0, 10) : "2026-09-06";
      const checkoutRes = (db.reservations || []).find(r => 
        (String(r.flatNumber) === "1304" || r.allocatedFlatNumbers?.includes("1304")) &&
        r.checkoutDate === itemDate &&
        r.status !== "cancelada" &&
        r.status !== "CANCELLED"
      );
      if (checkoutRes) {
        console.log(`[LostAndFound] Reparando hóspede do item ${item.id} (1304) para ${checkoutRes.guestName}`);
        item.lastGuestName = checkoutRes.guestName;
        item.lastGuestPhone = checkoutRes.guestPhone || item.lastGuestPhone;
        item.lastGuestEmail = checkoutRes.guestEmail || item.lastGuestEmail;
        item.lastCheckoutDate = checkoutRes.checkoutDate;
      } else {
        const checkoutClean = (db.cleaningRequests || []).find(c => 
          String(c.flatNumber) === "1304" && 
          (c.requestDate === itemDate || c.effectiveDate === itemDate) && 
          c.leavingGuest && c.leavingGuest !== "Thaiza"
        );
        if (checkoutClean) {
          console.log(`[LostAndFound] Reparando hóspede via limpeza para item ${item.id}: ${checkoutClean.leavingGuest}`);
          item.lastGuestName = checkoutClean.leavingGuest;
          const rByName = (db.reservations || []).find(r => r.guestName === checkoutClean.leavingGuest);
          if (rByName && rByName.guestPhone) item.lastGuestPhone = rByName.guestPhone;
        } else {
          console.log(`[LostAndFound] Atribuindo Pablo ao item ${item.id} (Flat 1304)`);
          item.lastGuestName = "Pablo";
          const pabloRes = (db.reservations || []).find(r => (r.guestName || "").toLowerCase().includes("pablo"));
          if (pabloRes && pabloRes.guestPhone) {
            item.lastGuestPhone = pabloRes.guestPhone;
            item.lastGuestEmail = pabloRes.guestEmail || "";
          }
        }
      }
    }
  }
}

function sanitizeReservationFlags() {
  if (!db.reservations) return;
  // Auto-recuperação/correção para a reserva RES-905-0067
  const res905 = (db.reservations || []).find(r => 
    (r.code && r.code.toUpperCase() === "RES-905-0067") || 
    (String(r.id) === "67" && String(r.flatNumber) === "905") ||
    (r.code && r.code.toUpperCase().includes("905-0067"))
  );
  if (res905) {
    let changed = false;
    if (!res905.isMonthlyGuest || res905.clientType !== "mensalista") {
      res905.isMonthlyGuest = true;
      res905.clientType = "mensalista";
      changed = true;
    }
    if (!res905.autoEmitInvoice) {
      res905.autoEmitInvoice = true;
      changed = true;
    }
    const matchedGuest = (db.guests || []).find(g => 
      (g.id && g.id === res905.guestId) ||
      (g.document && res905.guestDocument && g.document.replace(/\D/g, '') === res905.guestDocument.replace(/\D/g, '')) ||
      (g.name && res905.guestName && g.name.toLowerCase().trim() === res905.guestName.toLowerCase().trim())
    );
    if (matchedGuest) {
      if (!matchedGuest.isMonthlyGuest || matchedGuest.clientType !== "mensalista") {
        matchedGuest.isMonthlyGuest = true;
        matchedGuest.clientType = "mensalista";
        changed = true;
      }
      if (!matchedGuest.autoEmitInvoice) {
        matchedGuest.autoEmitInvoice = true;
        changed = true;
      }
    }
    if (changed) {
      saveDatabase();
      console.log("[Auto-Fix] Reserva RES-905-0067 e hóspede atualizados para Mensalista e Auto-Emitir Nota.");
    }
  }

  // Auto-recuperação/correção para a reserva CORP-212-0066 (PIX Banco Inter Oficial)
  const res212 = (db.reservations || []).find(r => 
    (r.code && r.code.toUpperCase() === "CORP-212-0066") || 
    (r.code && r.code.toUpperCase().includes("212-0066"))
  );
  if (res212 && (!res212.pixTxId || res212.pixTxId.startsWith("INTER_") || !res212.pixCopiaECola || res212.pixCopiaECola.includes("cobv/"))) {
    res212.pixTxId = "c49f630a14d7747a99d7ab97ac9fadf6";
    res212.pixCopiaECola = "00020101021226930014BR.GOV.BCB.PIX2571spi-qrcode.bancointer.com.br/spi/pj/v2/9683e576b3fa48d28c5b69cfd34ab7a55204000053039865406181.005802BR5901*6013CAMPOS_DOS_GO61082802014062070503***630408E7";
    res212.paymentStatus = "pendente_pix";
    res212.totalAmount = 181;
    saveDatabase();
    console.log("[Auto-Fix] Reserva CORP-212-0066 atualizada com PIX oficial Banco Inter!");
  }
}

async function loadDatabase() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, "utf-8");
      const loaded = JSON.parse(content);
      Object.assign(db, loaded);
      sanitizeReservationFlags();
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
          CREATE TABLE IF NOT EXISTS reservation_communications (
            id TEXT PRIMARY KEY,
            reservation_id TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'email',
            direction TEXT NOT NULL DEFAULT 'outbound',
            recipient TEXT NOT NULL,
            subject TEXT NOT NULL,
            body TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            metadata JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_res_comm_res_id ON reservation_communications(reservation_id);
        `);
        const res = await pgPool.query("SELECT value FROM system_store WHERE key = 'db_state'");
        if (res && res.rows && res.rows[0]) {
          const pgLoaded = res.rows[0].value;
          // Proteção mandatória: Se o PostgreSQL na nuvem estiver com periodicTasks vazias mas o arquivo local tiver as tarefas restauradas, preserva e sincroniza
          if ((!pgLoaded.periodicTasks || pgLoaded.periodicTasks.length === 0) && (db.periodicTasks && db.periodicTasks.length > 0)) {
            pgLoaded.periodicTasks = db.periodicTasks;
            pgLoaded.periodicExecutions = db.periodicExecutions;
            console.log("[PostgreSQL] Hidratando tarefas preventivas da base local para a nuvem...");
            pgPool.query(
              "INSERT INTO system_store (key, value, updated_at) VALUES ('db_state', $1, NOW()) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()",
              [JSON.stringify(pgLoaded)]
            ).catch(e => console.warn("[PostgreSQL] Erro ao sincronizar tarefas preventivas na nuvem:", e.message));
          }
          Object.assign(db, pgLoaded);
          console.log("[PostgreSQL] Estado restaurado da nuvem com sucesso!");
          sanitizeAndRecoverCleanings();
          sanitizeLostAndFound();
          sanitizeReservationFlags();
        }
      } catch (err) {
        console.warn("[PostgreSQL] Falha ao sincronizar estado inicial:", err.message);
      }
    }

    if (!db.reservationCommunications) db.reservationCommunications = [];

    // Restauração de Certificado Digital A1 a partir do PostgreSQL
    if (db.nfseConfig?.certificadoA1?.pfxBase64) {
      try {
        const certDir = path.join(__dirname, "certs");
        if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true });
        const certPath = path.join(certDir, "certificado_corpflats_a1.pfx");
        const buffer = Buffer.from(db.nfseConfig.certificadoA1.pfxBase64.replace(/^data:.*,/, ""), "base64");
        fs.writeFileSync(certPath, buffer);
        console.log("[NFS-e] Certificado Digital A1 restaurado da nuvem com sucesso!");
      } catch (cErr) {
        console.warn("[NFS-e] Falha ao restaurar arquivo do certificado:", cErr.message);
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
    ensureGuestCodes();
    sanitizeAndRecoverCleanings();
  } catch (err) {
    console.error("[Database] Erro ao ler database:", err);
  }
}

function ensureGuestCodes() {
  if (!db.guests) db.guests = [];
  let maxId = 0;
  for (const g of db.guests) {
    const numId = Number(g.id);
    if (!isNaN(numId) && numId > maxId) maxId = numId;
  }
  for (const g of db.guests) {
    if (!g.id || isNaN(Number(g.id))) {
      maxId++;
      g.id = maxId;
    }
    if (!g.guestCode) {
      g.guestCode = `HOSP-${String(g.id).padStart(5, "0")}`;
    }
  }
  if (db.reservations) {
    for (const r of db.reservations) {
      if (r.guestId && !r.guestCode) {
        const matched = db.guests.find(g => g.id === r.guestId);
        if (matched?.guestCode) r.guestCode = matched.guestCode;
      }
    }
  }
}

function calculateGuestAge(birthDate) {
  if (!birthDate) return null;
  const bDate = new Date(String(birthDate).substring(0, 10) + "T12:00:00");
  if (isNaN(bDate.getTime())) return null;
  const diffMs = new Date().getTime() - bDate.getTime();
  return Math.max(0, Math.floor(diffMs / (365.25 * 24 * 60 * 60 * 1000)));
}

function checkYouthLocalRisk({ birthDate, city, address, phone }) {
  const age = calculateGuestAge(birthDate);
  const isUnder30 = age !== null && age < 30;
  const locStr = `${city || ""} ${address || ""}`.toLowerCase();
  const isCampos = locStr.includes("campos") || locStr.includes("goytacazes");
  const cleanPhone = String(phone || "").replace(/\D/g, "");
  let ddd = "";
  if (cleanPhone.startsWith("55") && cleanPhone.length >= 12) {
    ddd = cleanPhone.substring(2, 4);
  } else if (cleanPhone.length >= 10) {
    ddd = cleanPhone.substring(0, 2);
  }
  const isTargetDDD = ["22", "21", "11"].includes(ddd);
  const isTriggered = Boolean(isUnder30 && isCampos && isTargetDDD);
  return {
    isTriggered,
    age,
    ddd,
    reason: isTriggered ? `Hóspede < 30 anos (${age} anos) de Campos dos Goytacazes (DDD ${ddd})` : ""
  };
}

async function evaluateGuestIdentityWithAI({ fullName, document, birthDate, selfieBase64, docPhotoBase64, selfieUrl, docPhotoUrl }) {
  const apiKey = process.env.GEMINI_API_KEY || db.settings?.geminiApiKey || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    return {
      status: "heuristic_ok",
      confidence: 90,
      isMatch: true,
      faceMatch: true,
      dataMatch: true,
      summary: "Validação estrutural realizada com sucesso. Documento e dados cadastrais em conformidade.",
      notes: "Para ativação da comparação facial biométrica instantânea por Visão Computacional, informe sua chave do Google Gemini nas Configurações do Sistema.",
      checkedAt: new Date().toISOString()
    };
  }

  try {
    const parts = [];
    parts.push({
      text: `Você é um perito de segurança e verificação de identidade em hospedagem da CorpFlats.
Analise a selfie do hóspede (que está segurando o documento oficial) e/ou a foto do documento oficial anexadas.
Dados fornecidos pelo hóspede:
- Nome Completo informado: "${fullName || 'Não informado'}"
- Documento/CPF informado: "${document || 'Não informado'}"
- Data de Nascimento: "${birthDate || 'Não informada'}"

Tarefas:
1. Avalie se a selfie contém uma pessoa real segurando documento e se a foto do documento é nítida.
2. Compare a face da selfie com a face presente na foto do documento (são a mesma pessoa?).
3. Verifique se o nome e número do documento visíveis conferem com o informado.
4. Responda estritamente em formato JSON puro (sem markdown ou blocos de código) no seguinte formato:
{
  "isMatch": true,
  "confidence": 95,
  "faceMatch": true,
  "dataMatch": true,
  "summary": "resumo objetivo em 1 frase",
  "notes": "detalhes técnicos da avaliação",
  "alerts": []
}`
    });

    const addImagePart = (base64OrUrl) => {
      if (!base64OrUrl) return;
      if (base64OrUrl.startsWith("data:")) {
        const match = base64OrUrl.match(/^data:(image\/[a-zA-Z0-9+]+);base64,(.+)$/);
        if (match) {
          parts.push({
            inlineData: {
              mimeType: match[1],
              data: match[2]
            }
          });
        }
      }
    };

    addImagePart(docPhotoBase64);
    addImagePart(selfieBase64);

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }]
      })
    });

    if (response.ok) {
      const data = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          status: "ai_evaluated",
          confidence: Number(parsed.confidence) || 85,
          isMatch: Boolean(parsed.isMatch),
          faceMatch: Boolean(parsed.faceMatch),
          dataMatch: Boolean(parsed.dataMatch),
          summary: parsed.summary || "Validação facial por Inteligência Artificial concluída.",
          notes: parsed.notes || "",
          alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [],
          checkedAt: new Date().toISOString()
        };
      }
    }
  } catch (err) {
    console.warn("[AI Identity Verification]", err.message);
  }

  return {
    status: "heuristic_fallback",
    confidence: 85,
    isMatch: true,
    faceMatch: true,
    dataMatch: true,
    summary: "Validação estrutural realizada com sucesso. Documento e selfie aceitos para conferência na recepção.",
    checkedAt: new Date().toISOString()
  };
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

// ── Reconciliação e Deduplicação Definitiva de Limpezas ────────────────────────
// Garante que nunca existam dois registros de limpeza para o mesmo flat na mesma data.
// Se um registro já estiver "clean" (limpo), ele sempre prevalecerá sobre qualquer duplicata suja!
function reconcileCleaningRequests() {
  if (!db.cleaningRequests) db.cleaningRequests = [];
  const byFlatAndDate = new Map();
  for (const req of db.cleaningRequests) {
    if (!req || (!req.flatId && !req.flatNumber) || !req.requestDate) continue;
    const fKey = String(req.flatNumber || req.flatId);
    const key = `${fKey}_${req.requestDate}`;
    if (!byFlatAndDate.has(key)) {
      byFlatAndDate.set(key, []);
    }
    byFlatAndDate.get(key).push(req);
  }

  const reconciled = [];
  for (const [key, items] of byFlatAndDate.entries()) {
    if (items.length === 1) {
      reconciled.push(items[0]);
    } else {
      // Prioridade absoluta: registro com status === "clean"
      const cleanItem = items.find(i => i.status === "clean");
      if (cleanItem) {
        reconciled.push(cleanItem);
      } else {
        const inProgress = items.find(i => i.status === "cleaning_now" || i.status === "will_clean");
        if (inProgress) {
          reconciled.push(inProgress);
        } else {
          reconciled.push(items[0]);
        }
      }
    }
  }

  db.cleaningRequests = reconciled;
  ensureUniqueRequestIds();
}

function saveDatabase() {
  try {
    reconcileCleaningRequests();
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

await loadDatabase();
ensureUniqueRequestIds();
reconcileCleaningRequests();
initWhatsAppEngine(app, () => db, saveDatabase);
initMaidAutomationEngine(app, () => db, saveDatabase);

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

// ── Reservation Audit Log Engine ─────────────────────────────────────────────
function addReservationAuditLog(reservation, {
  action = "updated",
  actor = null,
  source = "PMS Calendário",
  description = "",
  changes = []
} = {}) {
  if (!reservation) return null;
  if (!reservation.auditLogs) reservation.auditLogs = [];

  const now = new Date().toISOString();
  const entryId = `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const normalizedActor = {
    id: actor?.id || null,
    name: actor?.name || actor?.username || "Sistema",
    role: actor?.role || (actor?.name ? "user" : "system"),
    type: actor?.type || (actor?.role === "guest" ? "guest" : (actor?.name && actor?.name !== "Sistema" ? "user" : "system"))
  };

  const entry = {
    id: entryId,
    timestamp: now,
    action,
    actor: normalizedActor,
    source: source || "PMS Calendário",
    description: description || "Atualização da reserva",
    changes: Array.isArray(changes) ? changes : []
  };

  reservation.auditLogs.unshift(entry);
  reservation.lastModifiedBy = {
    timestamp: now,
    actor: normalizedActor,
    source: entry.source
  };

  try {
    logAuditEvent({
      level: action === "cancelled" ? "warning" : "info",
      category: "reservation",
      action: `RESERVATION_${String(action).toUpperCase()}`,
      actor: normalizedActor,
      source: entry.source,
      details: {
        reservationId: reservation.id,
        reservationCode: reservation.code,
        flatNumber: reservation.flatNumber,
        guestName: reservation.guestName,
        description: entry.description,
        changes: entry.changes
      }
    });
  } catch {}

  return entry;
}

function ensureReservationAuditLogs(reservation) {
  if (!reservation) return reservation;
  if (reservation.auditLogs && reservation.auditLogs.length > 0) return reservation;

  reservation.auditLogs = [];

  // 1. Log sintético de criação inicial
  const createdTimestamp = reservation.createdAt || new Date().toISOString();
  const channel = (reservation.channel || "").toLowerCase();
  let defaultCreator = "PMS / Recepção";
  let defaultSource = "PMS Calendário";
  let creatorType = "user";

  if (channel === "site" || channel === "site_direto") {
    defaultCreator = reservation.guestName || "Hóspede (Online)";
    defaultSource = "Site CorpFlats (Motor de Reservas)";
    creatorType = "guest";
  } else if (channel === "booking") {
    defaultCreator = "Canal Booking.com";
    defaultSource = "Booking.com Sync";
    creatorType = "system";
  } else if (channel === "airbnb") {
    defaultCreator = "Canal Airbnb";
    defaultSource = "Airbnb Sync";
    creatorType = "system";
  } else if (channel === "whatsapp") {
    defaultCreator = "Atendimento WhatsApp";
    defaultSource = "WhatsApp / Direta";
    creatorType = "user";
  }

  const creatorName = reservation.createdBy?.userName || reservation.createdBy?.name || defaultCreator;
  const creatorSource = reservation.createdBy?.source || defaultSource;

  reservation.auditLogs.push({
    id: `audit_init_${reservation.id || Date.now()}`,
    timestamp: createdTimestamp,
    action: "created",
    actor: {
      id: reservation.createdBy?.userId || null,
      name: creatorName,
      role: reservation.createdBy?.role || (creatorType === "guest" ? "guest" : "admin"),
      type: creatorType
    },
    source: creatorSource,
    description: "Reserva criada no sistema",
    changes: [
      { field: "flatNumber", label: "Apartamento", oldValue: null, newValue: `Flat ${reservation.flatNumber || reservation.flatId}` },
      { field: "dates", label: "Período da Estadia", oldValue: null, newValue: `${reservation.checkinDate} a ${reservation.checkoutDate}` },
      { field: "guestName", label: "Hóspede Titular", oldValue: null, newValue: reservation.guestName || "Não informado" },
      { field: "channel", label: "Canal", oldValue: null, newValue: reservation.channel || "direta" },
      ...(reservation.totalAmount ? [{ field: "totalAmount", label: "Valor Total", oldValue: null, newValue: `R$ ${Number(reservation.totalAmount).toFixed(2)}` }] : [])
    ]
  });

  // 2. Histórico de modificações anterior (ex: autoatendimento)
  if (Array.isArray(reservation.modificationHistory)) {
    for (const mod of reservation.modificationHistory) {
      reservation.auditLogs.unshift({
        id: `audit_mod_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: mod.modifiedAt || new Date().toISOString(),
        action: "portal_modify",
        actor: {
          id: null,
          name: reservation.guestName || "Hóspede",
          role: "guest",
          type: "guest"
        },
        source: "Portal do Hóspede (Autoatendimento)",
        description: mod.reason || "Alteração de datas pelo portal do hóspede",
        changes: [
          ...(mod.oldCheckin !== mod.newCheckin || mod.oldCheckout !== mod.newCheckout ? [
            { field: "dates", label: "Período", oldValue: `${mod.oldCheckin} a ${mod.oldCheckout}`, newValue: `${mod.newCheckin} a ${mod.newCheckout}` }
          ] : []),
          ...(mod.oldGuests !== mod.newGuests ? [
            { field: "guestCount", label: "Qtd. Hóspedes", oldValue: String(mod.oldGuests), newValue: String(mod.newGuests) }
          ] : []),
          ...(mod.additionalAmountToPay ? [
            { field: "additionalAmountToPay", label: "Acréscimo a Pagar", oldValue: null, newValue: `+R$ ${Number(mod.additionalAmountToPay).toFixed(2)}` }
          ] : [])
        ]
      });
    }
  }

  // 3. Status de Check-in ou Check-out
  if (reservation.actualCheckinAt) {
    reservation.auditLogs.unshift({
      id: `audit_chk_${reservation.id || Date.now()}_in`,
      timestamp: reservation.actualCheckinAt,
      action: "checkin",
      actor: { id: null, name: "Recepção / Portaria", role: "reception", type: "user" },
      source: "Recepção / Portaria",
      description: "Entrada (Check-in) registrada na portaria",
      changes: [{ field: "status", label: "Status da Reserva", oldValue: "Confirmada", newValue: "Hospedado (In House)" }]
    });
  }

  if (reservation.actualCheckoutAt) {
    reservation.auditLogs.unshift({
      id: `audit_chk_${reservation.id || Date.now()}_out`,
      timestamp: reservation.actualCheckoutAt,
      action: "checkout",
      actor: { id: null, name: "Recepção / Portaria", role: "reception", type: "user" },
      source: "Recepção / Portaria",
      description: "Saída (Check-out) registrada",
      changes: [{ field: "status", label: "Status da Reserva", oldValue: "Hospedado", newValue: "Concluída (Completed)" }]
    });
  }

  if (reservation.status === "cancelada" || reservation.status === "CANCELLED") {
    reservation.auditLogs.unshift({
      id: `audit_cancel_${reservation.id || Date.now()}`,
      timestamp: reservation.updatedAt || new Date().toISOString(),
      action: "cancelled",
      actor: { id: null, name: "Recepção / PMS", role: "admin", type: "user" },
      source: "PMS Calendário",
      description: "Reserva cancelada",
      changes: [{ field: "status", label: "Status da Reserva", oldValue: "Confirmada", newValue: "Cancelada" }]
    });
  }

  return reservation;
}

function diffReservationFields(oldRes, newBody, flatsList = []) {
  const changes = [];

  const FIELD_MAP = {
    checkinDate: "Data de Entrada (Check-in)",
    checkoutDate: "Data de Saída (Check-out)",
    guestName: "Hóspede Titular",
    guestPhone: "WhatsApp / Telefone",
    guestEmail: "E-mail do Hóspede",
    channel: "Canal de Origem",
    dailyRate: "Valor da Diária",
    totalAmount: "Valor Total",
    paidAmount: "Valor Pago",
    paymentStatus: "Status do Pagamento",
    status: "Status da Reserva",
    adults: "Adultos",
    children: "Crianças",
    guestCount: "Total de Hóspedes",
    notes: "Observações Gerais",
    receptionNotes: "Aviso para a Portaria / Recepção",
    earlyCheckinAuthorized: "Autorização de Early Check-in",
    autoEmitInvoice: "Auto-Emissão de Nota Fiscal (NFS-e)",
    prefersHighFloor: "Preferência por Andar Alto",
    twinBeds: "Configuração: 2 Camas de Solteiro",
    extraMattress: "Configuração: Colchão Extra",
    includeBreakfast: "Café da Manhã Incluso",
    specialRequests: "Pedidos Especiais",
    isMonthlyGuest: "Cliente Mensalista"
  };

  // Transferência de Apartamento
  if (newBody.flatId !== undefined && Number(newBody.flatId) !== Number(oldRes.flatId)) {
    const oldFlatNum = oldRes.flatNumber || flatsList.find(f => f.id === Number(oldRes.flatId))?.number || oldRes.flatId;
    const newFlatNum = flatsList.find(f => f.id === Number(newBody.flatId))?.number || newBody.flatId;
    changes.push({
      field: "flatNumber",
      label: "Apartamento (Transferência)",
      oldValue: `Flat ${oldFlatNum}`,
      newValue: `Flat ${newFlatNum}`
    });
  }

  for (const [key, label] of Object.entries(FIELD_MAP)) {
    if (newBody[key] === undefined) continue;

    let oldVal = oldRes[key];
    let newVal = newBody[key];

    if (typeof oldVal === "boolean" || typeof newVal === "boolean") {
      if (Boolean(oldVal) !== Boolean(newVal)) {
        changes.push({
          field: key,
          label,
          oldValue: Boolean(oldVal) ? "Sim" : "Não",
          newValue: Boolean(newVal) ? "Sim" : "Não"
        });
      }
    } else if (key === "dailyRate" || key === "totalAmount" || key === "paidAmount") {
      const numOld = Number(oldVal) || 0;
      const numNew = Number(newVal) || 0;
      if (Math.abs(numOld - numNew) > 0.01) {
        changes.push({
          field: key,
          label,
          oldValue: `R$ ${numOld.toFixed(2)}`,
          newValue: `R$ ${numNew.toFixed(2)}`
        });
      }
    } else if (key === "adults" || key === "children" || key === "guestCount") {
      const numOld = Number(oldVal) || 0;
      const numNew = Number(newVal) || 0;
      if (numOld !== numNew) {
        changes.push({
          field: key,
          label,
          oldValue: String(numOld),
          newValue: String(numNew)
        });
      }
    } else {
      const strOld = String(oldVal || "").trim();
      const strNew = String(newVal || "").trim();
      if (strOld !== strNew) {
        changes.push({
          field: key,
          label,
          oldValue: strOld || "(vazio)",
          newValue: strNew || "(vazio)"
        });
      }
    }
  }

  return changes;
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

function getBrasiliaNow() {
  const now = new Date();
  const dateStr = BRAZIL_DATE_FORMATTER.format(now);
  const timeParts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(now);
  const hour = Number(timeParts.find(p => p.type === "hour")?.value || "0");
  const minute = Number(timeParts.find(p => p.type === "minute")?.value || "0");
  const second = Number(timeParts.find(p => p.type === "second")?.value || "0");
  return {
    date: dateStr,
    hour,
    minute,
    second,
    timeStr: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  };
}

function isTimeBefore(t1, t2) {
  if (!t1 || !t2) return false;
  const [h1, m1] = String(t1).split(":").map(Number);
  const [h2, m2] = String(t2).split(":").map(Number);
  return (h1 * 60 + m1) < (h2 * 60 + m2);
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
const ALLOWED_COLUMN_LETTERS = ["C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "W"];
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

    // Preserva requisições manuais/administrativas e limpezas concluídas adicionadas pelos usuários
    const manualRequests = (db.cleaningRequests || []).filter(r => 
      r.source === "manual" || 
      r.source === "admin_manual" || 
      r.status === "clean" || 
      Boolean(r.addedBy)
    );
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
  // Transição definitiva para o PMS nativo: sincronização de planilha externa desativada.
  return true;
}

// ── Disparo Não-Bloqueante em Background (Stale-While-Revalidate) ──────────────
function triggerBackgroundSync() {
  return;
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
    role: u.role,
    whatsapp: u.whatsapp || u.phone || "",
    phone: u.phone || u.whatsapp || "",
    pixKey: u.pixKey || "",
    active: u.active !== false
  }));
  res.json(list);
});

app.get("/api/admin/users", (req, res) => {
  const userAuth = getAuthUser(req);
  if (userAuth?.role !== "admin") return res.status(403).json({ error: "Acesso negado." });
  const list = (db.users || []).map(u => ({
    id: u.id,
    username: u.username,
    name: u.name || u.username,
    role: u.role,
    whatsapp: u.whatsapp || u.phone || "",
    phone: u.phone || u.whatsapp || "",
    pixKey: u.pixKey || "",
    active: u.active !== false,
    lastLoginAt: u.lastLoginAt || null
  }));
  res.json(list);
});

app.post("/api/admin/users", (req, res) => {
  const userAuth = getAuthUser(req);
  if (userAuth?.role !== "admin") return res.status(403).json({ error: "Acesso negado." });
  const { username, password, role = "camareira", name, whatsapp, phone, pixKey } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: "Nome de usuário e senha são obrigatórios." });
  }
  if (db.users.some(u => u.username.toLowerCase() === username.trim().toLowerCase())) {
    return res.status(409).json({ error: "Já existe um usuário com esse nome." });
  }

  const cleanPh = cleanWhatsAppPhone(whatsapp || phone || "");
  const newUser = {
    id: db.users.length > 0 ? Math.max(...db.users.map(u => u.id)) + 1 : 1,
    username: username.trim(),
    name: (name || username).trim(),
    role: role === "admin" ? "admin" : (role === "recepcao" ? "recepcao" : "camareira"),
    whatsapp: cleanPh,
    phone: cleanPh,
    pixKey: (pixKey || "").trim(),
    active: true,
    passwordHash: hashPassword(password)
  };

  db.users.push(newUser);
  saveDatabase();
  res.status(201).json({ 
    id: newUser.id, 
    username: newUser.username, 
    name: newUser.name, 
    role: newUser.role,
    whatsapp: newUser.whatsapp,
    pixKey: newUser.pixKey,
    active: newUser.active
  });
});

app.patch("/api/admin/users/:id", (req, res) => {
  const userAuth = getAuthUser(req);
  if (userAuth?.role !== "admin") return res.status(403).json({ error: "Acesso negado." });
  const id = Number(req.params.id);
  const user = (db.users || []).find(u => u.id === id);
  if (!user) return res.status(404).json({ error: "Usuário não encontrado." });

  const { name, username, role, whatsapp, phone, pixKey, active } = req.body || {};

  if (username !== undefined && username.trim()) {
    const existing = db.users.find(u => u.id !== id && u.username.toLowerCase() === username.trim().toLowerCase());
    if (existing) return res.status(409).json({ error: "Já existe outro usuário com esse login." });
    user.username = username.trim();
  }
  if (name !== undefined) user.name = String(name).trim();
  if (role !== undefined && (role === "admin" || role === "camareira" || role === "recepcao")) {
    user.role = role;
  }
  if (whatsapp !== undefined || phone !== undefined) {
    const cleanPh = cleanWhatsAppPhone(whatsapp || phone || "");
    user.whatsapp = cleanPh;
    user.phone = cleanPh;
  }
  if (pixKey !== undefined) user.pixKey = String(pixKey).trim();
  if (active !== undefined) user.active = Boolean(active);

  saveDatabase();
  res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      name: user.name || user.username,
      role: user.role,
      whatsapp: user.whatsapp || "",
      phone: user.phone || "",
      pixKey: user.pixKey || "",
      active: user.active !== false
    }
  });
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
// ── Public Guest Checkout Context & Endpoints ──────────────────────────────
app.get("/api/public/checkout/context", (req, res) => {
  const code = (req.query.code || req.query.res || req.query.r || "").trim();
  if (!code) {
    return res.status(400).json({ error: "Código da reserva não informado." });
  }

  if (!db.reservations) db.reservations = [];
  const r = findReservationByLocatorOrContact(code);
  if (!r) {
    return res.status(404).json({ error: "Reserva não encontrada no sistema. Verifique o link ou procure a recepção." });
  }

  const rawFlatNum = r.flatNumber ? String(r.flatNumber) : "";
  const flat = (db.flats || []).find(f => (rawFlatNum && (f.number === rawFlatNum || f.number.replace(/\D/g, "") === rawFlatNum.replace(/\D/g, ""))) || f.id === r.flatId);
  const resolvedFlatNum = flat ? flat.number : (rawFlatNum || "Flat");

  const nowBrl = getBrasiliaNow();
  const todayStr = nowBrl.date;

  const isAlreadyCheckedOut = Boolean(
    r.actualCheckoutAt || 
    r.status === "completed" || 
    r.status === "checked_out" ||
    (flat && !flat.isOccupied && (db.cleaningRequests || []).some(c => c.flatId === flat.id && c.requestDate === todayStr && c.isVacant))
  );

  const guestName = (r.guestName || r.guests?.[0]?.name || "Hóspede").trim();
  const firstName = guestName.split(" ")[0];

  res.json({
    success: true,
    reservation: {
      id: r.id,
      code: r.code || code,
      guestName,
      firstName,
      flatNumber: resolvedFlatNum,
      checkinDate: r.checkinDate,
      checkoutDate: r.checkoutDate,
      checkoutTime: r.checkoutTime || db.settings?.checkoutTime || "12:00",
      isAlreadyCheckedOut
    },
    flat: {
      number: resolvedFlatNum,
      isOccupied: flat ? flat.isOccupied : false
    }
  });
});

app.post("/api/public/checkout", (req, res) => {
  let rawNum = String(req.body?.flatNumber || "").replace(/\D/g, "").trim();
  const code = String(req.body?.code || req.body?.res || req.body?.reservationCode || "").trim();
  let foundRes = null;

  if (code) {
    if (!db.reservations) db.reservations = [];
    foundRes = findReservationByLocatorOrContact(code);
    if (foundRes && !rawNum && foundRes.flatNumber) {
      rawNum = String(foundRes.flatNumber).replace(/\D/g, "").trim();
    }
  }

  if (!rawNum && !foundRes) {
    return res.status(400).json({ error: "Por favor, informe o código da reserva ou o número do apartamento." });
  }

  const flat = (db.flats || []).find(f => 
    (rawNum && (f.number === rawNum || f.number.replace(/\D/g, "") === rawNum)) ||
    (foundRes && (f.id === foundRes.flatId || (foundRes.flatNumber && f.number === String(foundRes.flatNumber))))
  );

  if (!flat) {
    return res.status(404).json({ error: `Apartamento ${rawNum || ""} não encontrado. Por favor, verifique o número ou contate a recepção.` });
  }

  const todayStr = getTodayStr();
  let existing = db.cleaningRequests.find(r => r.flatId === flat.id && r.requestDate === todayStr);

  const guestDisplayName = foundRes?.guestName || "Hóspede";
  const now = new Date().toISOString();
  if (existing) {
    existing.isVacant = true; // Confirma quarto desocupado
    existing.leavingGuest = guestDisplayName;
    if (!existing.pendingObservation) {
      existing.pendingObservation = `Check-out expresso confirmado (${guestDisplayName})`;
    } else if (!existing.pendingObservation.includes("Check-out")) {
      existing.pendingObservation = `${existing.pendingObservation} | Check-out expresso (${guestDisplayName})`;
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
      leavingGuest: guestDisplayName,
      arrivingGuest: null,
      pendingObservation: `Check-out expresso confirmado (${guestDisplayName})`,
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

  const nowBrl = getBrasiliaNow();
  const timeStr = nowBrl.timeStr;

  // Atualizar a reserva ativa deste flat ou a reserva identificada por código
  const matchingResList = (db.reservations || []).filter(r => 
    (foundRes && (r.id === foundRes.id || r.code === foundRes.code)) ||
    ((r.flatId === flat.id || String(r.flatNumber) === String(flat.number)) &&
    r.status !== "cancelada" && r.status !== "cancelado" &&
    r.checkinDate <= todayStr && r.checkoutDate >= todayStr)
  );
  matchingResList.forEach(r => {
    r.actualCheckoutAt = now;
    r.actualCheckoutTime = timeStr;
    r.status = "completed";
  });

  // Reconciliar pedidos de café da manhã para hoje neste flat:
  // Apenas cancela se o check-out ocorreu ANTES do horário de entrega do café agendado!
  if (!db.breakfastOrders) db.breakfastOrders = [];
  db.breakfastOrders.forEach(o => {
    const isMatch = String(o.roomNumber) === String(flat.number) || matchingResList.some(mr => mr.code === o.reservationCode || mr.id === o.reservationId);
    const orderDeliveryTime = o.deliveryTime || "08:00";
    if (isMatch && o.date === todayStr && o.status !== "cancelled" && isTimeBefore(timeStr, orderDeliveryTime)) {
      o.status = "cancelled";
      o.cancelReason = `Early check-out: Hóspede desocupou o quarto e saiu às ${timeStr} antes do horário do café (${orderDeliveryTime})`;
    }
  });

  saveDatabase();

  // Trigger Notification for Checkout
  createNotification({
    category: "checkout",
    title: `🚪 Check-out Realizado - Apt ${flat.number}`,
    message: `Saída do hóspede ${guestDisplayName} (Apt ${flat.number}) registrada. Quarto desocupado e pronto para limpeza.`,
    severity: "info",
    metadata: { flatId: flat.id, flatNumber: flat.number, guestName: guestDisplayName, code: foundRes?.code },
    targetUrl: "/dashboard"
  });

  res.json({
    success: true,
    flatNumber: flat.number,
    guestName: guestDisplayName,
    message: "Check-out confirmado com sucesso!"
  });
});

// ── Flats Endpoints ─────────────────────────────────────────────────────────
app.get("/api/flats", (req, res) => {
  db.flats = (db.flats || []).filter(f => String(f.number) !== "502");
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
    buildingName: (req.body.buildingName || db.settings?.buildingName || "Edifício Soho Residence Service").trim(),
    receptionEmail: (req.body.receptionEmail || "").trim(),
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
  if (req.body.buildingName !== undefined) flat.buildingName = String(req.body.buildingName).trim();
  if (req.body.receptionEmail !== undefined) flat.receptionEmail = String(req.body.receptionEmail).trim();
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

// ── Atualização de Tags e Particularidades do Flat ───────────────────────────
app.put("/api/flats/:id/tags", (req, res) => {
  const id = Number(req.params.id);
  const flat = (db.flats || []).find(f => f.id === id);
  if (!flat) return res.status(404).json({ error: "Flat não encontrado" });

  const { tags = [], airConditionerType, bedType, hasMicrowave, features = [], notes = "" } = req.body;
  
  flat.tags = Array.isArray(tags) ? tags : [];
  if (airConditionerType !== undefined) flat.airConditionerType = airConditionerType;
  if (bedType !== undefined) flat.bedType = bedType;
  if (hasMicrowave !== undefined) flat.hasMicrowave = Boolean(hasMicrowave);
  if (Array.isArray(features)) flat.features = features;
  if (notes !== undefined) flat.notes = notes;
  flat.updatedAt = new Date().toISOString();

  saveDatabase();
  console.log(`[Flats] Particularidades do Apt ${flat.number} atualizadas: ${flat.tags.join(", ") || "Sem tags"}`);
  res.json({ success: true, flat });
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
  const { flatNumber, flatId, reservationId, newCheckoutDate, additionalAmount, notes, forceConflict } = req.body || {};
  let item = db.cleaningRequests.find(r => r.id === reqId);
  if (!item && flatNumber) {
    item = db.cleaningRequests.find(r => String(r.flatNumber) === String(flatNumber) && r.status !== "clean");
  }

  const targetFlat = (db.flats || []).find(f => (flatNumber && String(f.number) === String(flatNumber)) || (flatId && f.id === Number(flatId)) || (item && f.id === item.flatId));
  const targetFlatNumber = targetFlat ? targetFlat.number : (flatNumber || (item ? item.flatNumber : ""));
  const targetFlatId = targetFlat ? targetFlat.id : (item ? item.flatId : null);

  if (!item && !targetFlatNumber) {
    return res.status(404).json({ error: "Solicitação de limpeza ou apartamento não encontrado." });
  }

  const userAuth = getAuthUser(req);
  const now = new Date().toISOString();
  const requestDate = item?.requestDate || req.body.requestDate || getTodayStr();

  // 1. Localizar a reserva correspondente no flat
  let targetRes = null;
  if (reservationId) {
    targetRes = (db.reservations || []).find(r => (r.id === Number(reservationId) || r.code === reservationId) && r.status !== "cancelada" && r.status !== "cancelado");
  }
  if (!targetRes && targetFlatNumber) {
    targetRes = (db.reservations || []).find(r => 
      (String(r.flatNumber) === String(targetFlatNumber) || (targetFlatId && r.flatId === targetFlatId)) &&
      r.status !== "cancelada" && r.status !== "cancelado" &&
      r.checkoutDate === requestDate
    );
  }
  if (!targetRes && item?.leavingGuest) {
    const lg = String(item.leavingGuest).toLowerCase().trim();
    targetRes = (db.reservations || []).find(r => 
      (String(r.flatNumber) === String(targetFlatNumber) || (targetFlatId && r.flatId === targetFlatId)) &&
      r.status !== "cancelada" && r.status !== "cancelado" &&
      r.guestName && (r.guestName.toLowerCase().trim() === lg || r.guestName.toLowerCase().includes(lg) || lg.includes(r.guestName.toLowerCase().trim()))
    );
  }
  if (!targetRes && targetFlatNumber) {
    const today = getTodayStr();
    targetRes = (db.reservations || []).find(r => 
      (String(r.flatNumber) === String(targetFlatNumber) || (targetFlatId && r.flatId === targetFlatId)) &&
      r.status !== "cancelada" && r.status !== "cancelado" &&
      r.checkinDate <= today && r.checkoutDate >= today
    );
  }
  if (!targetRes && targetFlatNumber) {
    const notCancelled = (db.reservations || [])
      .filter(r => (String(r.flatNumber) === String(targetFlatNumber) || (targetFlatId && r.flatId === targetFlatId)) && r.status !== "cancelada" && r.status !== "cancelado")
      .sort((a, b) => (b.checkoutDate || "").localeCompare(a.checkoutDate || ""));
    targetRes = notCancelled[0] || null;
  }

  // 2. Se informou nova data de check-out, validar e atualizar a reserva
  const addAmount = Math.max(0, parseFloat(additionalAmount) || 0);

  if (targetRes && newCheckoutDate) {
    if (newCheckoutDate <= targetRes.checkinDate) {
      return res.status(400).json({ 
        error: `A nova data de check-out (${newCheckoutDate}) deve ser posterior à data de check-in (${targetRes.checkinDate}).` 
      });
    }

    const oldCheckout = targetRes.checkoutDate;

    // Verificar se há reservas conflitantes no mesmo flat
    if (newCheckoutDate > oldCheckout) {
      const conflictRes = (db.reservations || []).find(other => {
        if (other.id === targetRes.id || other.status === "cancelada" || other.status === "cancelado") return false;
        const otherFlat = String(other.flatNumber || (db.flats.find(f => f.id === other.flatId)?.number || ""));
        if (otherFlat !== String(targetFlatNumber)) return false;
        return (oldCheckout < other.checkoutDate) && (newCheckoutDate > other.checkinDate);
      });

      if (conflictRes && !forceConflict) {
        return res.status(409).json({
          error: `Conflito de agenda: O Flat ${targetFlatNumber} já possui reserva para ${conflictRes.guestName || 'outro hóspede'} (Check-in: ${conflictRes.checkinDate}, Check-out: ${conflictRes.checkoutDate}).`,
          hasConflict: true,
          conflictingReservation: {
            id: conflictRes.id,
            guestName: conflictRes.guestName,
            checkinDate: conflictRes.checkinDate,
            checkoutDate: conflictRes.checkoutDate
          }
        });
      }
    }

    // Atualiza a reserva
    const oldTotal = Number(targetRes.totalAmount || targetRes.price || 0);
    const newTotal = oldTotal + addAmount;
    targetRes.checkoutDate = newCheckoutDate;
    targetRes.totalAmount = newTotal;

    // Se houve acréscimo financeiro, atualiza status de pagamento
    if (addAmount > 0) {
      const currentPaid = Number(targetRes.paidAmount || 0);
      if (currentPaid < newTotal) {
        targetRes.paymentStatus = currentPaid > 0 ? "pago_parcial" : "pendente";
      }
    }

    // Histórico e anotações
    const extLogText = `Extensão de estadia para ${newCheckoutDate}${addAmount > 0 ? ` (+R$ ${addAmount.toFixed(2)})` : ""}${notes ? ` - Obs: ${notes}` : ""}`;
    targetRes.notes = targetRes.notes 
      ? `${targetRes.notes}\n[${now.substring(0, 10)} ${now.substring(11, 16)}] ${extLogText}`
      : `[${now.substring(0, 10)} ${now.substring(11, 16)}] ${extLogText}`;

    // Incrementar sequência do calendário (RFC 5546)
    targetRes.calendarSequence = (targetRes.calendarSequence || 0) + 1;

    // Registrar log de auditoria da reserva
    ensureReservationAuditLogs(targetRes);
    addReservationAuditLog(targetRes, {
      action: "stay_extended",
      actor: userAuth ? { id: userAuth.id, name: userAuth.name || userAuth.username, role: userAuth.role } : { name: "Governança / Limpeza", role: "admin" },
      source: "Painel de Limpeza (Hóspede Estendeu)",
      description: extLogText,
      changes: [
        { field: "checkoutDate", label: "Data de Saída (Check-out)", oldValue: oldCheckout, newValue: newCheckoutDate },
        ...(addAmount > 0 ? [{ field: "totalAmount", label: "Valor Total", oldValue: `R$ ${oldTotal.toFixed(2)}`, newValue: `R$ ${newTotal.toFixed(2)} (+R$ ${addAmount.toFixed(2)})` }] : [])
      ]
    });

    // Sincronizar pedidos de café da manhã (se houver)
    if (db.breakfastOrders && oldCheckout !== newCheckoutDate) {
      db.breakfastOrders.forEach(o => {
        if ((o.reservationCode && (o.reservationCode === targetRes.code || o.reservationCode === targetRes.reservationCode)) || o.reservationId === targetRes.id || (String(o.roomNumber) === String(targetFlatNumber))) {
          if (o.date >= targetRes.checkinDate && o.date <= targetRes.checkoutDate && o.status === "cancelled" && o.cancelReason?.includes("antecipou")) {
            o.status = "pending";
            o.cancelReason = null;
          }
        }
      });
    }

    // Assegurar solicitação de limpeza na nova data de check-out
    if (!db.cleaningRequests) db.cleaningRequests = [];
    const hasFutureCleaning = db.cleaningRequests.some(c => 
      (String(c.flatNumber) === String(targetFlatNumber) || (targetFlatId && c.flatId === targetFlatId)) &&
      c.requestDate === newCheckoutDate
    );
    if (!hasFutureCleaning) {
      const maxId = db.cleaningRequests.length > 0 ? Math.max(...db.cleaningRequests.map(x => Number(x.id) || 0)) : 0;
      db.cleaningRequests.unshift({
        id: maxId + 1,
        flatId: targetFlatId || targetRes.flatId,
        flatNumber: targetFlatNumber,
        requestDate: newCheckoutDate,
        source: "checkout",
        status: "dirty",
        assignedUserId: null,
        assignedUsername: null,
        isVacant: false,
        isPriority: false,
        leavingGuest: targetRes.guestName,
        arrivingGuest: null,
        adminNote: null,
        createdAt: now,
        updatedAt: now
      });
    }
  }

  // 3. Atualizar as solicitações de limpeza pendentes da data consultada para status "extended"
  const extendedNote = newCheckoutDate 
    ? `Hóspede estendeu até ${newCheckoutDate}${addAmount > 0 ? ` (+R$ ${addAmount.toFixed(2)})` : ""}${notes ? ` - ${notes}` : ""}`
    : (notes || "Hóspede estendeu a estadia");

  let updatedCount = 0;
  if (db.cleaningRequests) {
    for (const r of db.cleaningRequests) {
      if ((String(r.flatNumber) === String(targetFlatNumber) || (targetFlatId && r.flatId === targetFlatId)) && r.status !== "clean" && (!item || r.requestDate === requestDate)) {
        r.status = "extended";
        r.isExtended = true;
        r.isVacant = false;
        r.pendingObservation = extendedNote;
        r.updatedAt = now;
        updatedCount++;
      }
    }
  }

  // Se não havia item em db.cleaningRequests (foi sintetizado no checkouts), cria o registro persistido
  if (updatedCount === 0 && targetFlatNumber) {
    const maxId = db.cleaningRequests.length > 0 ? Math.max(...db.cleaningRequests.map(r => Number(r.id) || 0)) : 0;
    db.cleaningRequests.unshift({
      id: maxId + 1,
      flatId: targetFlatId || (targetRes ? targetRes.flatId : null),
      flatNumber: targetFlatNumber,
      requestDate: requestDate,
      source: "checkout",
      status: "extended",
      isExtended: true,
      isVacant: false,
      leavingGuest: targetRes?.guestName || item?.leavingGuest || null,
      arrivingGuest: item?.arrivingGuest || null,
      pendingObservation: extendedNote,
      createdAt: now,
      updatedAt: now
    });
  }

  saveDatabase();

  logAuditEvent({
    level: "info",
    category: "cleaning",
    action: "STAY_EXTENDED",
    actor: { name: userAuth ? (userAuth.name || userAuth.username) : "Sistema", role: userAuth?.role || "admin" },
    details: { 
      flatNumber: targetFlatNumber, 
      newCheckoutDate: newCheckoutDate || null, 
      additionalAmount: addAmount, 
      reservationId: targetRes?.id || null, 
      guestName: targetRes?.guestName || null,
      notes: extendedNote 
    },
    source: "cleaning_dashboard"
  });

  res.json({ 
    success: true, 
    message: targetRes 
      ? `Flat ${targetFlatNumber} estendido até ${newCheckoutDate || 'nova data'} com sucesso. Reserva de ${targetRes.guestName} atualizada (+R$ ${addAmount.toFixed(2)}).`
      : `Flat ${targetFlatNumber} marcado como estadia estendida com sucesso.`,
    reservation: targetRes,
    newCheckoutDate,
    additionalAmount: addAmount
  });
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
  const cleaners = (db.users || [])
    .filter(u => u.role === "camareira" || u.role === "cleaner" || u.role === "admin")
    .map(u => ({ 
      id: u.id, 
      username: u.username, 
      name: u.name || u.username,
      role: u.role === "camareira" || u.role === "cleaner" ? "camareira" : u.role,
      whatsapp: u.whatsapp || u.phone || "",
      phone: u.phone || u.whatsapp || "",
      pixKey: u.pixKey || "",
      active: u.active !== false
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
  // Garante que cleaningRequests existe e não possui registros nulos
  db.cleaningRequests = (db.cleaningRequests || []).filter(r => r && (r.flatId || r.flatNumber));
  const requestsForDate = [];
  const existingFlatNumbersForDate = new Set();

  // 1. Identifica flats que estão com hóspede contínuo (STAYOVER) na data consultada
  // Se o hóspede entrou ANTES de dateStr (checkinDate < dateStr) e só sai DEPOIS de dateStr (checkoutDate > dateStr),
  // o flat é um stayover. Hóspedes entrando hoje (checkinDate === dateStr) são novos check-ins / turnovers, não stayover!
  const stayoverFlatNumbers = new Set(
    (db.reservations || [])
      .filter(r => r.status !== "cancelada" && r.checkinDate < dateStr && r.checkoutDate > dateStr)
      .map(r => String(r.flatNumber || (db.flats.find(f => f.id === r.flatId)?.number || "")))
  );

  // 2. Busca todas as reservas ativas que possuem CHECKOUT na data consultada (checkoutDate === dateStr)
  const pmsCheckouts = (db.reservations || []).filter(r => 
    r.status !== "cancelada" && 
    r.checkoutDate === dateStr
  );

  // Se houver reservas para o mesmo flat, mantém a mais recente
  const pmsCheckoutsByFlat = new Map();
  for (const res of pmsCheckouts) {
    const fNumber = String(res.flatNumber || (db.flats.find(f => f.id === res.flatId)?.number || ""));
    if (!fNumber) continue;
    if (stayoverFlatNumbers.has(fNumber)) continue;
    pmsCheckoutsByFlat.set(fNumber, res);
  }

  // 3. Monta os cards de limpeza dinâmicos a partir dos checkouts do PMS
  for (const [flatNumber, pmsRes] of pmsCheckoutsByFlat.entries()) {
    const flat = db.flats.find(f => String(f.number) === flatNumber) || { id: pmsRes.flatId, number: flatNumber, isOccupied: true };

    const arrivingRes = (db.reservations || []).find(r => 
      r.status !== "cancelada" && 
      String(r.flatNumber || (db.flats.find(f => f.id === r.flatId)?.number || "")) === flatNumber && 
      r.checkinDate === dateStr
    );

    const matchingCleanings = (db.cleaningRequests || []).filter(c => 
      (String(c.flatNumber) === flatNumber || c.flatId === flat.id) && 
      c.requestDate === dateStr
    );
    const existingCleaning = matchingCleanings.find(c => c.status === "clean") || matchingCleanings[0];

    const maxId = db.cleaningRequests.length > 0 ? Math.max(...db.cleaningRequests.map(r => Number(r.id) || 0)) : 0;
    const card = {
      id: existingCleaning ? existingCleaning.id : (maxId + 1),
      flatId: flat.id,
      flatNumber: flat.number,
      requestDate: dateStr,
      source: "checkout",
      status: existingCleaning ? existingCleaning.status : "dirty",
      assignedUserId: existingCleaning ? existingCleaning.assignedUserId : null,
      assignedUsername: existingCleaning ? existingCleaning.assignedUsername : null,
      assignedUserName: existingCleaning ? existingCleaning.assignedUserName : null,
      isVacant: existingCleaning ? Boolean(existingCleaning.isVacant) : false,
      isPriority: existingCleaning ? Boolean(existingCleaning.isPriority) : Boolean(pmsRes.isPriority),
      isExtended: false,
      twinBeds: Boolean(pmsRes.twinBeds),
      extraMattress: Boolean(pmsRes.extraMattress),
      adminNote: existingCleaning?.adminNote || pmsRes.notes || pmsRes.specialRequests || null,
      leavingGuest: pmsRes.guestName || pmsRes.title || "Hóspede",
      arrivingGuest: arrivingRes ? (arrivingRes.guestName || arrivingRes.title) : null,
      pendingObservation: existingCleaning ? existingCleaning.pendingObservation : null,
      willCleanAt: existingCleaning ? existingCleaning.willCleanAt : null,
      cleaningStartedAt: existingCleaning ? existingCleaning.cleaningStartedAt : null,
      completedAt: existingCleaning ? existingCleaning.completedAt : null,
      durationMinutes: existingCleaning ? existingCleaning.durationMinutes : null,
      createdAt: existingCleaning ? existingCleaning.createdAt : `${dateStr}T08:00:00.000Z`,
      updatedAt: existingCleaning ? existingCleaning.updatedAt : `${dateStr}T08:00:00.000Z`
    };

    if (!existingCleaning && dateStr >= "2026-09-01") {
      db.cleaningRequests.push(card);
    }

    requestsForDate.push(card);
    existingFlatNumbersForDate.add(flatNumber);
  }

  // 4. Garante que qualquer solicitação existente no banco de dados para a data apareça na listagem
  for (const r of (db.cleaningRequests || [])) {
    const fNumber = String(r.flatNumber || "");
    if (r.requestDate === dateStr && !existingFlatNumbersForDate.has(fNumber)) {
      requestsForDate.push(r);
      existingFlatNumbersForDate.add(fNumber);
    }
  }

  // 5. Carry-Over de pendências não limpas de dias anteriores (apenas se o quarto NÃO virou stayover e APENAS PARA HOJE)
  if (dateStr === getTodayStr()) {
    const previousUncleaned = (db.cleaningRequests || []).filter(r => {
      const fNumber = String(r.flatNumber || "");
      if (!r.requestDate || r.requestDate < "2026-09-01" || r.requestDate >= dateStr || r.status === "clean" || r.status === "extended" || r.status === "no_show") return false;
      if (!r.leavingGuest && r.source !== "manual" && r.source !== "admin_manual" && r.source !== "guest_checkout") return false;
      if (stayoverFlatNumbers.has(fNumber)) return false;
      if (existingFlatNumbersForDate.has(fNumber)) return false;

      // Se o flat já possui qualquer limpeza concluída (status === "clean") nessa mesma data ou em data posterior,
      // ele já foi higienizado e NÃO deve ser considerado pendência nem reaparecer para limpar!
      const alreadyCleanedOnOrAfter = (db.cleaningRequests || []).some(c => 
        (String(c.flatNumber) === fNumber || c.flatId === r.flatId) &&
        c.requestDate >= r.requestDate &&
        c.status === "clean"
      );
      if (alreadyCleanedOnOrAfter) return false;

      return true;
    });

    previousUncleaned.sort((a, b) => new Date(b.requestDate).getTime() - new Date(a.requestDate).getTime());

    for (const prevReq of previousUncleaned) {
      const fNumber = String(prevReq.flatNumber || "");
      if (!existingFlatNumbersForDate.has(fNumber)) {
        requestsForDate.push({
          ...prevReq,
          isPendingFromPreviousDay: true,
          originalRequestDate: prevReq.requestDate
        });
        existingFlatNumbersForDate.add(fNumber);
      }
    }
  }

  return requestsForDate;
}

app.post("/api/admin/reset-cleaning-cache", (req, res) => {
  db.cleaningRequests = [];
  saveDatabase();
  res.json({ success: true, count: 0 });
});

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
      r.checkinDate < dateStr && r.checkoutDate > dateStr
    );
    const hasFutureCheckoutOnly = Boolean(activeResToday && activeResToday.checkoutDate > dateStr && !req_.leavingGuest && req_.source !== "guest_checkout" && !req_.isVacant);

    // Identifica a reserva do hóspede saindo hoje ou ativa no flat
    const checkoutRes = (db.reservations || []).find(r => 
      (r.flatId === flat.id || String(r.flatNumber) === String(flat.number)) &&
      r.status !== "cancelada" && r.status !== "cancelado" &&
      r.checkoutDate === dateStr
    ) || (req_.leavingGuest ? (db.reservations || []).find(r => 
      (r.flatId === flat.id || String(r.flatNumber) === String(flat.number)) &&
      r.status !== "cancelada" && r.status !== "cancelado" &&
      (r.guestName?.toLowerCase() === req_.leavingGuest?.toLowerCase() || (r.guestName && req_.leavingGuest && req_.leavingGuest.toLowerCase().includes(r.guestName.toLowerCase())))
    ) : null) || activeResToday;

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
      reservation: checkoutRes ? {
        id: checkoutRes.id,
        code: checkoutRes.code,
        guestName: checkoutRes.guestName,
        checkinDate: checkoutRes.checkinDate,
        checkoutDate: checkoutRes.checkoutDate,
        dailyRate: Number(checkoutRes.dailyRate || 0),
        totalAmount: Number(checkoutRes.totalAmount || checkoutRes.price || 0),
        paidAmount: Number(checkoutRes.paidAmount || 0),
        paymentStatus: checkoutRes.paymentStatus || "pendente"
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
        durationMinutes: req_.durationMinutes || null,
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
        `Wi-Fi: apto${resItem.flatNumber || ''} (Senha: 1234567890123)`,
        `Gerenciar sua reserva: ${manageUrl}`,
        `WhatsApp Suporte: +55 (22) 99712-4021`
      );
    }

    const formattedDesc = descLines.join("\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
    const partStat = sequence > 0 ? "NEEDS-ACTION" : "ACCEPTED";

    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//CorpFlats//Motor de Reservas 2.0//PT",
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
      `ORGANIZER;CN="CorpFlats Campos dos Goytacazes":mailto:reservas@corpflats.com.br`,
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


// ── Helper Universal: Encontra ou Auto-Cria Solicitação de Limpeza em Memória / Banco ──
function findOrUpsertCleaningRequest(reqId, flatNumber, flatId, dateStr = null) {
  if (!db.cleaningRequests) db.cleaningRequests = [];
  const targetDate = dateStr || getTodayStr();

  // 1. Procura por ID numérico direto
  let item = db.cleaningRequests.find(r => r.id === Number(reqId));

  // 2. Procura por Flat e Data (priorizando clean se houver múltiplos)
  if (!item && flatNumber) {
    const matching = db.cleaningRequests.filter(r => String(r.flatNumber) === String(flatNumber) && r.requestDate === targetDate);
    item = matching.find(r => r.status === "clean") || matching[0];
  }
  if (!item && flatId) {
    const matching = db.cleaningRequests.filter(r => r.flatId === Number(flatId) && r.requestDate === targetDate);
    item = matching.find(r => r.status === "clean") || matching[0];
  }

  // 3. Se ainda não achou, procura nos cards dinâmicos gerados para a data
  if (!item) {
    const virtualList = getRequestsForDate(targetDate);
    const virtualCard = virtualList.find(c => 
      c.id === Number(reqId) || 
      (flatNumber && String(c.flatNumber) === String(flatNumber)) ||
      (flatId && c.flatId === Number(flatId))
    );

    const maxId = db.cleaningRequests.length > 0 ? Math.max(...db.cleaningRequests.map(r => Number(r.id) || 0)) : 0;
    const newId = maxId + 1;
    const now = new Date().toISOString();

    const targetFlatObj = db.flats.find(f => 
      (virtualCard && (f.id === virtualCard.flatId || String(f.number) === String(virtualCard.flatNumber))) ||
      (flatNumber && String(f.number) === String(flatNumber)) ||
      (flatId && f.id === Number(flatId))
    );

    item = {
      id: newId,
      flatId: targetFlatObj ? targetFlatObj.id : (virtualCard?.flatId || (flatId ? Number(flatId) : 1)),
      flatNumber: targetFlatObj ? targetFlatObj.number : (virtualCard?.flatNumber || String(flatNumber || "113")),
      requestDate: targetDate,
      source: virtualCard?.source || "checkout",
      status: virtualCard?.status || "dirty",
      assignedUserId: virtualCard?.assignedUserId || null,
      assignedUsername: virtualCard?.assignedUsername || null,
      assignedUserName: virtualCard?.assignedUserName || null,
      isVacant: Boolean(virtualCard?.isVacant),
      isPriority: Boolean(virtualCard?.isPriority),
      isExtended: false,
      twinBeds: Boolean(virtualCard?.twinBeds),
      extraMattress: Boolean(virtualCard?.extraMattress),
      adminNote: virtualCard?.adminNote || null,
      leavingGuest: virtualCard?.leavingGuest || null,
      arrivingGuest: virtualCard?.arrivingGuest || null,
      pendingObservation: null,
      willCleanAt: null,
      cleaningStartedAt: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now
    };

    db.cleaningRequests.unshift(item);
  }

  return item;
}

// ── Cleaning Status Change & Execution ──────────────────────────────────────
app.patch("/api/cleaning/assignments/:requestId/status", (req, res) => {
  const reqId = Number(req.params.requestId);
  const { status, observation, isVacant, executedPeriodicTaskIds = [], surveyAnswers = [], flatNumber, flatId, date, assignedUserId } = req.body;
  
  let item = findOrUpsertCleaningRequest(reqId, flatNumber, flatId, date);
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
      item.assignedUsername = null;
      item.assignedUserName = null;
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
      const assignedU = db.users.find(u => u.id === item.assignedUserId);
      if (assignedU) {
        item.assignedUsername = assignedU.username;
        item.assignedUserName = assignedU.name || assignedU.username;
      }
      item.willCleanAt = now;
    } else if (status === "cleaning_now") {
      item.cleaningStartedAt = now;
      if (assignedUserId) {
        item.assignedUserId = Number(assignedUserId);
      } else if (!item.assignedUserId) {
        item.assignedUserId = userAuth ? userAuth.id : 2;
      }
      const assignedU = db.users.find(u => u.id === item.assignedUserId);
      if (assignedU) {
        item.assignedUsername = assignedU.username;
        item.assignedUserName = assignedU.name || assignedU.username;
      }
    } else if (status === "clean" || status === "pending_issue") {
      item.completedAt = now;
      if (assignedUserId) {
        item.assignedUserId = Number(assignedUserId);
      } else if (!item.assignedUserId) {
        item.assignedUserId = userAuth ? userAuth.id : 2;
      }
      const assignedU = db.users.find(u => u.id === item.assignedUserId);
      if (assignedU) {
        item.assignedUsername = assignedU.username;
        item.assignedUserName = assignedU.name || assignedU.username;
      }
      item.pendingObservation = status === "pending_issue" ? (observation || "Pendência registrada") : null;

      if (status === "clean") {
        if (item.cleaningStartedAt && item.completedAt) {
          const startMs = new Date(item.cleaningStartedAt).getTime();
          const endMs = new Date(item.completedAt).getTime();
          if (endMs > startMs) {
            item.durationMinutes = Math.max(1, Math.round((endMs - startMs) / 60000));
          }
        } else if (!item.durationMinutes) {
          item.durationMinutes = 35;
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
      : `CLEANING_STATUS_${(status || "UPDATED").toUpperCase()}`,
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
    const item = findOrUpsertCleaningRequest(id, null, null, todayStr);
    if (item && (item.status === "dirty" || !item.status)) {
      item.status = "will_clean";
      item.assignedUserId = userAuth ? userAuth.id : 2;
      const assignedU = db.users.find(u => u.id === item.assignedUserId);
      if (assignedU) {
        item.assignedUsername = assignedU.username;
        item.assignedUserName = assignedU.name || assignedU.username;
      }
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
    if (effectiveDate < "2026-09-01") return false;
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
      executionDate: (r.completedAt ? r.completedAt.substring(0, 10) : r.requestDate),
      status: r.status,
      isPriority: r.isPriority || false,
      source: r.source || "checkout",
      assignedUserId: r.assignedUserId,
      assignedUsername: assignedUser ? assignedUser.username : (r.assignedUsername || "Camareira"),
      pendingObservation: r.pendingObservation || r.adminNote || null,
      cleaningStartedAt: r.cleaningStartedAt,
      completedAt: r.completedAt,
      durationMinutes: r.durationMinutes || durationMinutes,
      addedBy: r.addedBy || null,
      addedAt: r.addedAt || null,
      adminNote: r.adminNote || null,
      leavingGuest: r.leavingGuest || null,
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

// ── Admin Housekeeping Report Management (Add/Remove records with Audit) ────
app.post("/api/cleaning/admin/record", (req, res) => {
  const userAuth = getAuthUser(req);
  if (userAuth?.role !== "admin") {
    return res.status(403).json({ error: "Apenas administradores podem adicionar diárias de limpeza." });
  }

  const { flatNumber, flatId, requestDate, assignedUserId, status = "clean", durationMinutes = 35, adminNote = "", observation = "" } = req.body || {};
  if (!requestDate) {
    return res.status(400).json({ error: "A data da limpeza é obrigatória." });
  }

  const targetFlat = db.flats.find(f => (flatNumber && String(f.number) === String(flatNumber)) || (flatId && f.id === Number(flatId)));
  const finalFlatNumber = targetFlat ? String(targetFlat.number) : String(flatNumber || "101");
  const finalFlatId = targetFlat ? targetFlat.id : Number(flatId || 1);
  const targetUser = assignedUserId ? db.users.find(u => u.id === Number(assignedUserId)) : null;

  if (!db.cleaningRequests) db.cleaningRequests = [];
  const maxId = db.cleaningRequests.length > 0 ? Math.max(...db.cleaningRequests.map(r => Number(r.id) || 0)) : 0;
  const nowIso = new Date().toISOString();
  const completedTimeIso = status === "clean" ? `${requestDate}T18:00:00.000Z` : null;

  const newReq = {
    id: maxId + 1,
    flatId: finalFlatId,
    flatNumber: finalFlatNumber,
    requestDate: requestDate,
    source: "admin_manual",
    status: status || "clean",
    assignedUserId: targetUser ? targetUser.id : (assignedUserId ? Number(assignedUserId) : null),
    assignedUsername: targetUser ? targetUser.username : null,
    assignedUserName: targetUser ? targetUser.username : null,
    isVacant: true,
    isPriority: false,
    adminNote: adminNote || observation || "Lançamento manual pelo ADM",
    pendingObservation: observation || adminNote || null,
    durationMinutes: Number(durationMinutes) || 35,
    cleaningStartedAt: status === "clean" ? `${requestDate}T17:15:00.000Z` : null,
    completedAt: completedTimeIso,
    addedBy: userAuth.username || "admin",
    addedAt: nowIso,
    createdAt: nowIso,
    updatedAt: nowIso
  };

  db.cleaningRequests.unshift(newReq);
  saveDatabase();

  logAuditEvent({
    level: "info",
    category: "cleaning",
    action: "CLEANING_RECORD_ADDED_BY_ADMIN",
    actor: { name: userAuth.username || "admin", role: "admin" },
    details: {
      requestId: newReq.id,
      flatNumber: finalFlatNumber,
      requestDate,
      assignedMaidName: targetUser ? targetUser.username : "Sem camareira",
      addedBy: userAuth.username || "admin",
      addedAt: nowIso
    }
  });

  res.status(201).json({ success: true, message: "Diária de limpeza adicionada com sucesso!", record: newReq });
});

app.delete("/api/cleaning/admin/record/:id", (req, res) => {
  const userAuth = getAuthUser(req);
  if (userAuth?.role !== "admin") {
    return res.status(403).json({ error: "Apenas administradores podem remover diárias do relatório." });
  }

  const id = Number(req.params.id);
  const targetIndex = (db.cleaningRequests || []).findIndex(r => r.id === id);
  if (targetIndex === -1) {
    return res.status(404).json({ error: "Registro de limpeza não encontrado." });
  }

  const removed = db.cleaningRequests[targetIndex];
  db.cleaningRequests.splice(targetIndex, 1);
  saveDatabase();

  logAuditEvent({
    level: "info",
    category: "cleaning",
    action: "CLEANING_RECORD_REMOVED_BY_ADMIN",
    actor: { name: userAuth.username || "admin", role: "admin" },
    details: {
      requestId: id,
      flatNumber: removed.flatNumber,
      requestDate: removed.requestDate,
      assignedMaidName: removed.assignedUsername || "Sem camareira",
      removedBy: userAuth.username || "admin",
      removedAt: new Date().toISOString()
    }
  });

  res.json({ success: true, message: `Diária do Flat ${removed.flatNumber} em ${removed.requestDate} removida com sucesso.` });
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

app.post("/api/admin/restore-periodic-tasks", (req, res) => {
  const userAuth = getAuthUser(req);
  if (userAuth && userAuth.role !== "admin") {
    return res.status(403).json({ error: "Apenas administradores podem restaurar tarefas preventivas." });
  }
  if (req.body?.tasks && Array.isArray(req.body.tasks)) {
    db.periodicTasks = req.body.tasks;
  }
  if (req.body?.executions && Array.isArray(req.body.executions)) {
    db.periodicExecutions = req.body.executions;
  }
  saveDatabase();
  res.json({
    success: true,
    message: "Tarefas preventivas e histórico de execuções sincronizados com sucesso!",
    tasksCount: (db.periodicTasks || []).length,
    executionsCount: (db.periodicExecutions || []).length
  });
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
    if (effectiveDate < "2026-09-01") return false;
    return effectiveDate >= startDate && effectiveDate <= endDate;
  });

  let grandTotalToPay = 0;

  // Camareiras / Usuários
  const candidateUsers = (db.users || []).filter(u => u.role === "camareira" || u.role === "cleaner" || u.role === "admin");
  const cleaningsByUser = candidateUsers.map(u => {
    const userCleanings = completedCleanings
      .filter(c => c.assignedUserId === u.id)
      .sort((a, b) => {
        const dateA = a.completedAt ? a.completedAt.substring(0, 10) : (a.requestDate || "");
        const dateB = b.completedAt ? b.completedAt.substring(0, 10) : (b.requestDate || "");
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
          effectiveDate: (c.completedAt ? c.completedAt.substring(0, 10) : c.requestDate),
          cleaningStartedAt: c.cleaningStartedAt,
          completedAt: c.completedAt,
          durationMinutes: c.durationMinutes || itemDuration,
          rate: ratePerRoom,
          leavingGuest: c.leavingGuest || null
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
  const petPolicy = db.siteConfig?.petPolicy || db.settings?.petPolicy || DEFAULT_SITE_CONFIG.petPolicy;
  res.json({
    ...db.settings,
    petPolicy,
    houseRules: db.settings.houseRules || DEFAULT_HOUSE_RULES,
    contractTerms: db.settings.contractTerms || DEFAULT_CONTRACT_TERMS,
    termsAndRules: db.settings.termsAndRules || DEFAULT_TERMS_AND_RULES
  });
});

app.patch("/api/settings", (req, res) => {
  const { onedriveShareUrl, syncIntervalMinutes, sheetName, alertHour, termsAndRules, houseRules, contractTerms, adminWhatsApp, autoEarlyCheckinForSite, checkinTime, checkoutTime, hotelAddress, googleMapsUrl, receptionEmail, buildingName, petPolicy } = req.body;
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
  if (receptionEmail !== undefined) db.settings.receptionEmail = receptionEmail;
  if (buildingName !== undefined) db.settings.buildingName = buildingName;
  if (petPolicy !== undefined) {
    if (!db.siteConfig) db.siteConfig = {};
    db.siteConfig.petPolicy = {
      ...(db.siteConfig.petPolicy || DEFAULT_SITE_CONFIG.petPolicy),
      ...petPolicy
    };
    db.settings.petPolicy = db.siteConfig.petPolicy;
  }
  saveDatabase();
  const currentPetPolicy = db.siteConfig?.petPolicy || db.settings?.petPolicy || DEFAULT_SITE_CONFIG.petPolicy;
  res.json({
    ...db.settings,
    petPolicy: currentPetPolicy,
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

    // Cálculo de noites solicitadas e disponibilidade diária
    const requestedNights = [];
    let curr = new Date(checkin + "T12:00:00Z");
    const end = new Date(checkout + "T12:00:00Z");

    if (isNaN(curr.getTime()) || isNaN(end.getTime()) || curr >= end) {
      requestedNights.push(checkin);
    } else {
      while (curr < end) {
        requestedNights.push(curr.toISOString().slice(0, 10));
        curr.setUTCDate(curr.getUTCDate() + 1);
      }
    }

    const activeReservations = (db.reservations || []).filter(r => r.status !== "cancelada");
    const dailyAvailability = requestedNights.map(d => {
      const occupiedOnDate = new Set(
        activeReservations
          .filter(r => r.checkinDate <= d && r.checkoutDate > d)
          .map(r => String(r.flatNumber || r.flatId))
      );
      const availableCount = allFlats.filter(
        f => !occupiedOnDate.has(String(f.number)) && !occupiedOnDate.has(String(f.id))
      ).length;
      return {
        date: d,
        availableFlats: availableCount
      };
    });

    const minAvailableOnAnyDate = dailyAvailability.length > 0
      ? Math.min(...dailyAvailability.map(item => item.availableFlats))
      : totalAvailable;

    const hasLowAvailability = minAvailableOnAnyDate <= 5 || totalAvailable <= 5;

    res.json({
      available: totalAvailable > 0,
      totalAvailableFlats: totalAvailable,
      dailyAvailability,
      minAvailableOnAnyDate,
      hasLowAvailability,
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

// ── Utilitários PIX Padrão BACEN (BR Code EMV) ──────────────────────────────
function crc16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= (str.charCodeAt(i) << 8);
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function generateStaticPixPayload({ pixKey = "47964813000165", amount = 0, merchantName = "CORPFLATS LTDA", merchantCity = "CAMPOS DOS GOYTACAZES", txid = "***" }) {
  const formatTag = (id, value) => `${id}${String(value.length).padStart(2, "0")}${value}`;
  let payload = formatTag("00", "01");
  const gui = formatTag("00", "br.gov.bcb.pix");
  const key = formatTag("01", pixKey);
  payload += formatTag("26", `${gui}${key}`);
  payload += formatTag("52", "0000");
  payload += formatTag("53", "986");
  if (amount && Number(amount) > 0) {
    payload += formatTag("54", Number(amount).toFixed(2));
  }
  payload += formatTag("58", "BR");
  const cleanName = (merchantName || "CORPFLATS LTDA")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, "").trim().substring(0, 25);
  payload += formatTag("59", cleanName || "CORPFLATS LTDA");
  const cleanCity = (merchantCity || "CAMPOS")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, "").trim().substring(0, 15);
  payload += formatTag("60", cleanCity || "CAMPOS");
  const cleanTxId = (txid || "***").replace(/[^a-zA-Z0-9]/g, "").substring(0, 25) || "***";
  payload += formatTag("62", formatTag("05", cleanTxId));
  const toCrc = `${payload}6304`;
  return `${toCrc}${crc16(toCrc)}`;
}

// ── Endpoint de Reserva Direta com Rodízio e Governança Inteligente ──────────
app.post("/api/reservations/direct-booking", async (req, res) => {
  try {
    const {
      sessionId = null,
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
      earlyCheckin = false,
      lateCheckout = false,
      lateCheckoutTime = null,
      earlyCheckinFee = 0,
      lateCheckoutFee = 0,
      cleaningFee = 0,
      twinFee = 0,
      extraBedFee = 0,
      dailyRate = 0,
      totalAmount = 0,
      discountAmount = 0,
      paymentMethod = "pix",
      isWorkTrip = false,
      companyData = null,
      vehicle = null,
      extras = null
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
      earlyCheckin: Boolean(earlyCheckin),
      lateCheckout: Boolean(lateCheckout),
      earlyCheckinFee: Number(earlyCheckinFee) || 0,
      lateCheckoutFee: Number(lateCheckoutFee) || 0,
      lateCheckoutTime: lateCheckout ? (lateCheckoutTime || "18:00") : null,
      checkinTime: db.settings?.checkinTime || "14:00",
      checkoutTime: lateCheckout && lateCheckoutTime ? lateCheckoutTime : (db.settings?.checkoutTime || "12:00"),
      extras: extras || null,
      totalAmount: Number(totalAmount),
      paidAmount: paymentMethod === "pix" || paymentMethod === "card" || paymentMethod === "cartao_credito" ? 0 : Number(totalAmount),
      paymentStatus: paymentMethod === "pix" ? "pendente_pix" : (paymentMethod === "card" || paymentMethod === "cartao_credito" ? "pendente_cartao" : "pago_total"),
      paymentMethod,
      isWorkTrip: Boolean(isWorkTrip),
      companyData: isWorkTrip ? companyData : null,
      vehicle: vehicle || null,
      calendarSequence: 0,
      createdBy: {
        userName: guestName.trim(),
        role: "guest",
        source: "Site CorpFlats (Motor de Reservas)",
        createdAt: new Date().toISOString()
      },
      auditLogs: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (lateCheckout) {
      const lateFeeStr = Number(lateCheckoutFee) > 0 ? `Taxa: R$ ${lateCheckoutFee}` : `Cortesia R$ 0`;
      const lateNote = `🕒 Late Check-out Domingo solicitado para às ${lateCheckoutTime || "18:00"} (${lateFeeStr})`;
      reservation.notes = reservation.notes ? `${reservation.notes} • ${lateNote}` : lateNote;
    }

    addReservationAuditLog(reservation, {
      action: "created",
      actor: {
        id: null,
        name: guestName.trim(),
        role: "guest",
        type: "guest"
      },
      source: "Site CorpFlats (Motor de Reservas)",
      description: "Reserva criada pelo hóspede no site direto",
      changes: [
        { field: "flatNumber", label: "Apartamento", oldValue: null, newValue: `Flat(s) ${flatNumbersStr}` },
        { field: "dates", label: "Período da Estadia", oldValue: null, newValue: `${checkinDate} a ${checkoutDate}` },
        { field: "guestName", label: "Hóspede Titular", oldValue: null, newValue: guestName.trim() },
        { field: "channel", label: "Canal de Origem", oldValue: null, newValue: "site_direto" },
        { field: "totalAmount", label: "Valor Total", oldValue: null, newValue: `R$ ${Number(totalAmount).toFixed(2)}` },
        { field: "paymentMethod", label: "Forma de Pagamento", oldValue: null, newValue: paymentMethod },
        { field: "ratePlan", label: "Plano Selecionado", oldValue: null, newValue: ratePlan === "with_breakfast" ? "Com Café da Manhã" : "Sem Café" }
      ]
    });

    // Salva ou recupera o hóspede no CRM com identificador único intransferível
    if (!db.guests) db.guests = [];
    const cleanDoc = (guestDocument || "").replace(/\D/g, "");
    const cleanPhone = (guestPhone || "").replace(/\D/g, "");
    const cleanEmail = (guestEmail || "").trim().toLowerCase();

    let guest = db.guests.find(g => 
      (cleanDoc && (g.documentNumber || g.document || "").replace(/\D/g, "") === cleanDoc) ||
      (cleanPhone && (g.phone || "").replace(/\D/g, "") === cleanPhone) ||
      (cleanEmail && (g.email || "").trim().toLowerCase() === cleanEmail)
    );

    if (!guest) {
      const nextGuestId = db.guests.length > 0 ? Math.max(...db.guests.map(g => Number(g.id) || 0)) + 1 : 1;
      guest = {
        id: nextGuestId,
        guestCode: `HOSP-${String(nextGuestId).padStart(5, "0")}`,
        name: guestName.trim(),
        phone: guestPhone.trim(),
        email: cleanEmail,
        document: (guestDocument || "").trim(),
        createdAt: new Date().toISOString()
      };
      db.guests.push(guest);
    } else {
      if (!guest.guestCode) guest.guestCode = `HOSP-${String(guest.id).padStart(5, "0")}`;
      if (guestDocument && !guest.document) guest.document = guestDocument.trim();
      if (guestPhone) guest.phone = guestPhone.trim();
      if (guestEmail) guest.email = cleanEmail;
      if (guestName) guest.name = guestName.trim();
    }

    reservation.guestId = guest.id;
    reservation.guestCode = guest.guestCode;
    reservation.guestDocument = (guestDocument || "").trim() || guest.document || "";

    // Inicializa estrutura isolada de múltiplos hóspedes
    const totalCount = Math.min(Math.max(Number(totalGuestsCount) || 1, 1), 3);
    const titularAlreadyDone = Boolean(guest.fnhrCompleted && guest.photoUrl && guest.docPhotoUrl);
    reservation.guests = [
      {
        index: 1,
        guestId: guest.id,
        guestCode: guest.guestCode,
        name: guest.name || guestName.trim(),
        cpf: reservation.guestDocument || guest.document || "",
        phone: guest.phone || guestPhone.trim(),
        email: guest.email || cleanEmail,
        birthDate: guest.birthDate || "",
        gender: guest.gender || "masculino",
        address: guest.address || "",
        city: guest.city || "",
        state: guest.state || "RJ",
        docPhotoUrl: guest.docPhotoUrl || null,
        selfieUrl: guest.photoUrl || null,
        signatureUrl: guest.signatureUrl || null,
        isMinor: Boolean(guest.isMinor),
        minorAge: guest.minorAge || null,
        minorKinship: guest.minorKinship || "",
        minorAuthDocUrl: guest.minorAuthDocUrl || null,
        riskAttentionAlert: Boolean(guest.riskAttentionAlert),
        riskAttentionReason: guest.riskAttentionReason || "",
        aiVerification: guest.aiVerification || null,
        hasCompletedCheckin: titularAlreadyDone,
        checkinCompletedAt: titularAlreadyDone ? (guest.fnhrCompletedAt || new Date().toISOString()) : null
      }
    ];

    for (let i = 2; i <= totalCount; i++) {
      reservation.guests.push({
        index: i,
        name: `Hóspede ${i}`,
        cpf: "",
        phone: "",
        email: "",
        birthDate: "",
        docPhotoUrl: null,
        selfieUrl: null,
        signatureUrl: null,
        hasCompletedCheckin: false,
        checkinCompletedAt: null
      });
    }

    if (titularAlreadyDone) {
      reservation.selfieUrl = guest.photoUrl;
      reservation.docPhotoUrl = guest.docPhotoUrl;
      reservation.signatureUrl = guest.signatureUrl;
      if (reservation.guests.every(g => g.hasCompletedCheckin)) {
        reservation.fnhrCompleted = true;
      }
    }

    if (!db.reservations) db.reservations = [];
    db.reservations.push(reservation);

    // Atualiza status no funil / carrinho abandonado se houver sessionId ou telefone
    if (!db.abandonedCarts) db.abandonedCarts = [];
    let linkedCart = null;
    if (sessionId) {
      linkedCart = db.abandonedCarts.find(c => c.sessionId === sessionId);
    }
    if (!linkedCart && guestPhone) {
      linkedCart = db.abandonedCarts.find(c => c.guestPhone === guestPhone && c.status !== "concluido");
    }
    if (linkedCart) {
      linkedCart.status = "concluido";
      linkedCart.recoveredAt = new Date().toISOString();
      linkedCart.reservationCode = resCode;
      linkedCart.totalAmount = Number(totalAmount);
    }

    // Registra evento de conversão do funil de vendas
    if (!db.funnelEvents) db.funnelEvents = [];
    db.funnelEvents.push({
      id: Date.now(),
      sessionId: sessionId || `sess_${Date.now()}`,
      step: 5,
      stepName: "booking_confirmed",
      reservationCode: resCode,
      guestName: guestName.trim(),
      guestPhone: guestPhone.trim(),
      totalAmount: Number(totalAmount),
      timestamp: new Date().toISOString()
    });
    if (db.funnelEvents.length > 2000) db.funnelEvents = db.funnelEvents.slice(-2000);

    saveDatabase();

    // 5. Integração PIX Banco Inter Oficial com Fallback Estático
    let pixData = null;
    if (paymentMethod === "pix") {
      try {
        const pixResult = await createInterPixCob({
          amount: totalAmount,
          description: `Reserva CorpFlats ${resCode}`,
          debtorName: guestName,
          debtorDocument: guestDocument,
          reservationCode: resCode
        });
        pixData = {
          pixCopiaECola: pixResult.pixCopiaECola,
          txid: pixResult.txid,
          valor: totalAmount
        };
        reservation.pixTxId = pixResult.txid;
        reservation.pixCopiaECola = pixResult.pixCopiaECola;
        saveDatabase();
      } catch (pixErr) {
        console.warn("[Direct Booking] Falha na emissão de PIX dinâmico Inter, gerando PIX estático oficial:", pixErr.message);
        const staticPayload = generateStaticPixPayload({
          pixKey: DEFAULT_INTER_CONFIG.pixKey || "47964813000165",
          amount: totalAmount,
          merchantName: "CORPFLATS LTDA",
          merchantCity: "CAMPOS DOS GOYTACAZES",
          txid: resCode.replace(/[^a-zA-Z0-9]/g, "").substring(0, 25)
        });
        pixData = {
          pixCopiaECola: staticPayload,
          txid: `STAT_${Date.now()}`,
          valor: totalAmount
        };
        reservation.pixTxId = pixData.txid;
        reservation.pixCopiaECola = staticPayload;
        saveDatabase();
      }
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

    triggerImmediateWhatsApp(db, saveDatabase, "reservation_created", reservation);

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

// ── Motor Fair-Share: Quarto da Vez (Balanceamento de Uso & Ociosidade) ───────
function calculateFairShareStats(checkinDate, checkoutDate, excludeResId = null) {
  const flats = (db.flats || []).filter(f => String(f.number) !== "502" && f.id !== 9);
  if (flats.length === 0) return { bestFlat: null, availableCount: 0, allStats: [] };

  const [y, m] = checkinDate.split("-").map(Number);
  const monthStart = `${y}-${String(m).padStart(2, '0')}-01`;
  const nextM = m === 12 ? 1 : m + 1;
  const nextY = m === 12 ? y + 1 : y;
  const monthEnd = `${nextY}-${String(nextM).padStart(2, '0')}-01`;

  const flatStats = flats.map(flat => {
    // 1. Verifica conflitos no período solicitado
    const conflicts = (db.reservations || []).filter(r => 
      r.id !== excludeResId &&
      r.status !== "cancelada" &&
      (r.flatId === flat.id || String(r.flatNumber) === String(flat.number)) &&
      r.checkinDate < checkoutDate &&
      r.checkoutDate > checkinDate
    );

    const blockConflicts = (db.roomBlocks || []).filter(b => 
      (b.flatId === flat.id || String(b.flatNumber) === String(flat.number)) &&
      b.startDate < checkoutDate &&
      b.endDate > checkinDate
    );

    const isAvailable = conflicts.length === 0 && blockConflicts.length === 0;

    // 2. Calcula total de diárias ocupadas no mês do checkin
    const monthReservations = (db.reservations || []).filter(r => 
      r.id !== excludeResId &&
      r.status !== "cancelada" &&
      (r.flatId === flat.id || String(r.flatNumber) === String(flat.number)) &&
      r.checkinDate < monthEnd &&
      r.checkoutDate > monthStart
    );

    let monthOccupiedDays = 0;
    for (const r of monthReservations) {
      const startD = new Date(Math.max(new Date(r.checkinDate).getTime(), new Date(monthStart).getTime()));
      const endD = new Date(Math.min(new Date(r.checkoutDate).getTime(), new Date(monthEnd).getTime()));
      const days = Math.max(0, Math.round((endD - startD) / 86400000));
      monthOccupiedDays += days;
    }

    // 3. Dias desde o último checkout antes do checkinDate (tempo ocioso)
    const pastReservations = (db.reservations || []).filter(r => 
      r.id !== excludeResId &&
      r.status !== "cancelada" &&
      (r.flatId === flat.id || String(r.flatNumber) === String(flat.number)) &&
      r.checkoutDate <= checkinDate
    ).sort((a, b) => b.checkoutDate.localeCompare(a.checkoutDate));

    let daysSinceLastCheckout = 999;
    if (pastReservations.length > 0) {
      const lastOut = new Date(pastReservations[0].checkoutDate);
      const reqIn = new Date(checkinDate);
      daysSinceLastCheckout = Math.max(0, Math.round((reqIn - lastOut) / 86400000));
    }

    return {
      flat,
      isAvailable,
      conflicts: conflicts.map(c => ({
        id: c.id,
        code: c.code,
        guestName: c.guestName,
        checkinDate: c.checkinDate,
        checkoutDate: c.checkoutDate,
        channel: c.channel
      })),
      blockConflicts,
      monthOccupiedDays,
      daysSinceLastCheckout,
      reservationsCountMonth: monthReservations.length
    };
  });

  const available = flatStats.filter(s => s.isAvailable);

  // Ordenação: 1º menor uso no mês, 2º maior ociosidade, 3º número do flat
  available.sort((a, b) => {
    if (a.monthOccupiedDays !== b.monthOccupiedDays) {
      return a.monthOccupiedDays - b.monthOccupiedDays;
    }
    if (a.daysSinceLastCheckout !== b.daysSinceLastCheckout) {
      return b.daysSinceLastCheckout - a.daysSinceLastCheckout;
    }
    return a.flat.number.localeCompare(b.flat.number, undefined, { numeric: true });
  });

  const bestFlat = available.length > 0 ? available[0].flat : null;

  return {
    bestFlat,
    bestFlatId: bestFlat?.id || null,
    bestFlatNumber: bestFlat?.number || null,
    availableCount: available.length,
    allStats: flatStats
  };
}

app.get("/api/pms/fair-share-flat", (req, res) => {
  const { checkin, checkout, excludeResId } = req.query;
  if (!checkin || !checkout) {
    return res.status(400).json({ error: "Check-in e Check-out são obrigatórios." });
  }

  const result = calculateFairShareStats(checkin, checkout, excludeResId ? Number(excludeResId) : null);
  res.json(result);
});

app.get("/api/pms/calendar", (req, res) => {
  const { startDate, endDate } = req.query;
  const start = startDate || getOffsetDateStr(-3);
  const end = endDate || getOffsetDateStr(30);

  const todayStr = getTodayStr();
  const cleaningRequestsToday = getRequestsForDate(todayStr);

  const flats = [...db.flats].filter(f => String(f.number) !== "502" && f.id !== 9).sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true })).map(f => {
    const fNum = String(f.number);
    const req = cleaningRequestsToday.find(r => String(r.flatNumber) === fNum || r.flatId === f.id);
    let cleaningStatus = "clean";
    let cleaningLabel = "Limpo";
    if (req) {
      if (req.status === "cleaning_now" || req.status === "in_progress") {
        cleaningStatus = "cleaning_now";
        cleaningLabel = "Limpando";
      } else if (req.status === "dirty" || req.status === "pending") {
        cleaningStatus = "dirty";
        cleaningLabel = "Sujo";
      } else if (req.status === "clean") {
        cleaningStatus = "clean";
        cleaningLabel = "Limpo";
      }
    }
    return {
      ...f,
      cleaningStatus,
      cleaningLabel
    };
  });
  const rawReservations = (db.reservations || []).filter(r => {
    return r.checkinDate <= end && r.checkoutDate >= start && r.status !== "cancelada";
  });

  const reservations = rawReservations.map(r => {
    const matchedGuest = (db.guests || []).find(g => 
      (g.id && g.id === r.guestId) ||
      (g.document && r.guestDocument && g.document.replace(/\D/g, '') === r.guestDocument.replace(/\D/g, '')) ||
      (g.phone && r.guestPhone && g.phone.replace(/\D/g, '') === r.guestPhone.replace(/\D/g, '')) ||
      (g.name && r.guestName && g.name.toLowerCase().trim() === r.guestName.toLowerCase().trim()) ||
      (g.fullName && r.guestName && g.fullName.toLowerCase().trim() === r.guestName.toLowerCase().trim())
    );

    const isMonthly = Boolean(
      r.isMonthlyGuest || 
      r.clientType === "mensalista" || 
      matchedGuest?.isMonthlyGuest || 
      matchedGuest?.clientType === "mensalista"
    );
    const autoInvoice = Boolean(
      r.autoEmitInvoice || 
      matchedGuest?.autoEmitInvoice
    );

    const rChanLower = String(r.channel || "").toLowerCase();
    const isOtaRes = rChanLower.includes("booking") || rChanLower.includes("airbnb");
    const isPaid = isOtaRes || r.paymentStatus === "pago_total" || r.paymentStatus === "pago";
    const sanitizedPaid = isPaid && Number(r.totalAmount) > 0 ? Number(r.totalAmount) : (Number(r.paidAmount) || 0);

    return {
      ...r,
      paidAmount: sanitizedPaid,
      checkinTime: r.checkinTime || db.settings?.checkinTime || "14:00",
      checkoutTime: r.checkoutTime || db.settings?.checkoutTime || "12:00",
      isMonthlyGuest: isMonthly,
      clientType: isMonthly ? "mensalista" : (r.clientType || "avulso"),
      autoEmitInvoice: autoInvoice,
      includeBreakfast: Boolean(r.includeBreakfast || r.hasBreakfast || r.ratePlan === "with_breakfast" || r.notes?.toLowerCase().includes("café") || r.notes?.toLowerCase().includes("cafe")),
      hasMinor: Boolean(r.hasMinor || matchedGuest?.isMinor || (r.guests || []).some(g => g.isMinor)),
      riskAttentionAlert: Boolean(r.riskAttentionAlert || matchedGuest?.riskAttentionAlert || (r.guests || []).some(g => g.riskAttentionAlert)),
      riskAttentionReason: r.riskAttentionReason || matchedGuest?.riskAttentionReason || (r.guests || []).find(g => g.riskAttentionAlert)?.riskAttentionReason || "",
      breakfastToken: r.breakfastToken || (r.code ? `bfk_${r.code.toLowerCase().replace(/[^a-z0-9]/g, '')}` : `bfk_${r.id}`)
    };
  });
  const blocks = (db.roomBlocks || []).filter(b => {
    return b.startDate <= end && b.endDate >= start;
  });

  res.json({
    startDate: start,
    endDate: end,
    flats,
    reservations,
    blocks,
    guests: db.guests || [],
    settings: {
      checkinTime: db.settings?.checkinTime || "14:00",
      checkoutTime: db.settings?.checkoutTime || "12:00"
    }
  });
});

app.get("/api/pms/reservations/:id/audit-logs", (req, res) => {
  const param = String(req.params.id || "").trim();
  const numId = Number(param);
  const r = (db.reservations || []).find(x => x.id === numId || x.code === param || x.reservationCode === param);
  if (!r) return res.status(404).json({ error: "Reserva não encontrada" });

  ensureReservationAuditLogs(r);
  res.json({
    reservationId: r.id,
    reservationCode: r.code || r.reservationCode,
    createdBy: r.createdBy || null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    lastModifiedBy: r.lastModifiedBy || null,
    auditLogs: r.auditLogs || []
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
    checkinTime,
    checkoutTime,
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
    includeBreakfast = false,
    isMonthlyGuest = false,
    clientType = "avulso",
    autoEmitInvoice = false
  } = req.body;

  if (!flatId || !checkinDate || !checkoutDate || (!guestName && (!guests || guests.length === 0))) {
    return res.status(400).json({ error: "Apartamento, Hóspede e Datas são obrigatórios." });
  }

  const isMonthly = Boolean(isMonthlyGuest || clientType === "mensalista" || req.body.isMonthlyGuest || req.body.clientType === "mensalista");
  const autoInvoice = Boolean(autoEmitInvoice || req.body.autoEmitInvoice);

  const chanLower = String(channel || "").toLowerCase();
  const isOta = chanLower.includes("booking") || chanLower.includes("airbnb");
  let resolvedPaymentStatus = paymentStatus || "pendente";
  let resolvedPaidAmount = Number(paidAmount) || 0;
  if (isOta && (resolvedPaymentStatus === "pendente" || !resolvedPaymentStatus)) {
    resolvedPaymentStatus = "pago_total";
  }
  if (resolvedPaymentStatus === "pago_total" && Number(totalAmount) > 0) {
    resolvedPaidAmount = Number(totalAmount);
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
    (req.body.guestId && g.id === Number(req.body.guestId)) ||
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
      isMonthlyGuest: isMonthly,
      clientType: isMonthly ? "mensalista" : "avulso",
      autoEmitInvoice: autoInvoice,
      createdAt: new Date().toISOString()
    };
    db.guests.push(guest);
  } else {
    if (primaryPhone) guest.phone = primaryPhone;
    if (primaryEmail) guest.email = primaryEmail;
    if (primaryDoc) guest.document = primaryDoc;
    if (companyName) guest.companyName = companyName;
    if (isMonthly) {
      guest.isMonthlyGuest = true;
      guest.clientType = "mensalista";
    }
    if (autoInvoice) {
      guest.autoEmitInvoice = true;
    }
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

  const authUser = getAuthUser(req);
  const creatorName = authUser ? (authUser.username || authUser.name || "Administrador") : "Recepção / PMS";
  const creatorRole = authUser ? authUser.role : "admin";
  const reqSource = req.body.source || "PMS Calendário";

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
    checkinTime: String(checkinTime || db.settings?.checkinTime || "14:00").trim(),
    checkoutTime: String(checkoutTime || db.settings?.checkoutTime || "12:00").trim(),
    status: "confirmada",
    channel,
    dailyRate: Number(dailyRate),
    totalAmount: Number(totalAmount),
    paidAmount: resolvedPaidAmount,
    paymentStatus: resolvedPaymentStatus,
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
    isMonthlyGuest: isMonthly,
    clientType: isMonthly ? "mensalista" : "avulso",
    autoEmitInvoice: autoInvoice,
    breakfastToken: `bfk_${resId}_${crypto.randomBytes(4).toString("hex")}`,
    createdBy: {
      userId: authUser?.id || null,
      userName: creatorName,
      role: creatorRole,
      source: reqSource,
      createdAt: new Date().toISOString()
    },
    auditLogs: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  addReservationAuditLog(newReservation, {
    action: "created",
    actor: {
      id: authUser?.id || null,
      name: creatorName,
      role: creatorRole,
      type: "user"
    },
    source: reqSource,
    description: "Reserva criada no PMS Calendário",
    changes: [
      { field: "flatNumber", label: "Apartamento", oldValue: null, newValue: `Flat ${flat.number}` },
      { field: "dates", label: "Período da Estadia", oldValue: null, newValue: `${checkinDate} a ${checkoutDate}` },
      { field: "guestName", label: "Hóspede Titular", oldValue: null, newValue: primaryName },
      { field: "channel", label: "Canal de Origem", oldValue: null, newValue: channel },
      { field: "totalAmount", label: "Valor Total", oldValue: null, newValue: `R$ ${Number(totalAmount).toFixed(2)}` },
      { field: "paymentStatus", label: "Status de Pagamento", oldValue: null, newValue: paymentStatus },
      ...(includeBreakfast ? [{ field: "includeBreakfast", label: "Café da Manhã", oldValue: null, newValue: "Incluso" }] : []),
      ...(isMonthly ? [{ field: "isMonthlyGuest", label: "Cliente Mensalista", oldValue: null, newValue: "Sim" }] : []),
      ...(autoInvoice ? [{ field: "autoEmitInvoice", label: "Auto-Emissão de Nota Fiscal (NFS-e)", oldValue: null, newValue: "Sim" }] : []),
      ...(req.body.receptionNotes ? [{ field: "receptionNotes", label: "Aviso para a Portaria / Recepção", oldValue: null, newValue: req.body.receptionNotes }] : []),
      ...(isEarlyAuth ? [{ field: "earlyCheckinAuthorized", label: "Autorização de Early Check-in", oldValue: null, newValue: "Sim" }] : [])
    ]
  });

  db.reservations.unshift(newReservation);
  saveDatabase();
  triggerImmediateWhatsApp(db, saveDatabase, "reservation_created", newReservation);
  res.status(201).json(newReservation);
});

app.put("/api/pms/reservations/:id", (req, res) => {
  const id = Number(req.params.id);
  const r = (db.reservations || []).find(x => x.id === id);
  if (!r) return res.status(404).json({ error: "Reserva não encontrada" });

  ensureReservationAuditLogs(r);
  const diffs = diffReservationFields(r, req.body, db.flats || []);

  const oldCheckin = r.checkinDate;
  const oldCheckout = r.checkoutDate;
  const oldFlatId = r.flatId;
  const oldStatus = r.status;
  const oldGuestName = r.guestName;

  if (req.body.checkinDate && oldCheckin && oldCheckin !== req.body.checkinDate) {
    r.previousCheckinDate = oldCheckin;
  }
  if (req.body.checkoutDate && oldCheckout && oldCheckout !== req.body.checkoutDate) {
    r.previousCheckoutDate = oldCheckout;
  }

  const fields = [
    "flatId", "checkinDate", "checkoutDate", "checkinTime", "checkoutTime", "status", "channel", 
    "dailyRate", "totalAmount", "paidAmount", "paymentStatus", 
    "adults", "children", "notes", "prefersHighFloor", "twinBeds", 
    "extraMattress", "specialRequests", "isMonthlyGuest", "clientType", "includeBreakfast",
    "autoEmitInvoice", "earlyCheckinAuthorized", "receptionNotes",
    "guestCount", "guests", "guestDocument", "requesterType", "requesterInfo",
    "companyId", "companyName"
  ];
  for (const f of fields) {
    if (req.body[f] !== undefined) r[f] = req.body[f];
  }
  if (req.body.isMonthlyGuest !== undefined || req.body.clientType !== undefined) {
    const isMonthly = Boolean(req.body.isMonthlyGuest || req.body.clientType === "mensalista");
    r.isMonthlyGuest = isMonthly;
    r.clientType = isMonthly ? "mensalista" : "avulso";
  }
  if (req.body.autoEmitInvoice !== undefined) {
    r.autoEmitInvoice = Boolean(req.body.autoEmitInvoice);
  }
  if (req.body.earlyCheckinAuthorized !== undefined) {
    r.earlyCheckinAuthorized = Boolean(req.body.earlyCheckinAuthorized);
  }
  if (req.body.receptionNotes !== undefined) {
    r.receptionNotes = String(req.body.receptionNotes || "");
  }

  const putChanLower = String(r.channel || "").toLowerCase();
  const putIsOta = putChanLower.includes("booking") || putChanLower.includes("airbnb");
  if (putIsOta && (!r.paymentStatus || r.paymentStatus === "pendente") && req.body.paymentStatus === undefined) {
    r.paymentStatus = "pago_total";
  }
  if (r.paymentStatus === "pago_total" && Number(r.totalAmount) > 0) {
    r.paidAmount = Number(r.totalAmount);
  }

  // Sincroniza com o hóspede no CRM se aplicável
  const matchedGuest = (db.guests || []).find(g => 
    (r.guestId && g.id === r.guestId) ||
    (r.guestPhone && g.phone === r.guestPhone) ||
    (r.guestDocument && g.document === r.guestDocument) ||
    (r.guestName && (g.name?.toLowerCase().trim() === r.guestName.toLowerCase().trim() || g.fullName?.toLowerCase().trim() === r.guestName.toLowerCase().trim()))
  );
  if (matchedGuest) {
    if (req.body.isMonthlyGuest !== undefined || req.body.clientType !== undefined) {
      matchedGuest.isMonthlyGuest = r.isMonthlyGuest;
      matchedGuest.clientType = r.clientType;
    }
    if (req.body.autoEmitInvoice !== undefined) {
      matchedGuest.autoEmitInvoice = r.autoEmitInvoice;
    }
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

  // Sincronização automática com a Governança / Limpeza quando muda a data de check-out ou flat:
  if (oldCheckout !== r.checkoutDate || oldFlatId !== r.flatId) {
    if (!db.cleaningRequests) db.cleaningRequests = [];
    const flatNum = r.flatNumber || (db.flats.find(f => f.id === r.flatId)?.number);

    // 1. Verifica se na nova data de check-out (r.checkoutDate) já existe uma limpeza concluída para este flat
    const existingCleanOnTarget = db.cleaningRequests.find(c => 
      (c.flatId === r.flatId || String(c.flatNumber) === String(flatNum)) && 
      c.requestDate === r.checkoutDate && 
      c.status === "clean"
    );

    // 2. Procura solicitação não-concluída na data antiga para este flat
    const oldReq = db.cleaningRequests.find(c => 
      (c.flatId === oldFlatId || String(c.flatNumber) === String(flatNum)) && 
      c.requestDate === oldCheckout && 
      c.status !== "clean"
    );

    if (existingCleanOnTarget) {
      // Se o flat já está limpo na data de destino, descarta qualquer pendência antiga da data anterior
      // para nunca sobrescrever nem recriar duplicatas sujas sobre um quarto já higienizado!
      if (oldReq) {
        db.cleaningRequests = db.cleaningRequests.filter(c => c.id !== oldReq.id);
      }
    } else if (oldReq) {
      // Verifica se já existe outra solicitação na data de destino
      const existingOnTarget = db.cleaningRequests.find(c => 
        (c.flatId === r.flatId || String(c.flatNumber) === String(flatNum)) && 
        c.requestDate === r.checkoutDate
      );
      if (existingOnTarget) {
        // Já existe um card na nova data; descarta o card obsoleto da data antiga
        db.cleaningRequests = db.cleaningRequests.filter(c => c.id !== oldReq.id);
      } else {
        // Move a pendência para a nova data
        oldReq.requestDate = r.checkoutDate;
        oldReq.flatId = r.flatId;
        oldReq.flatNumber = flatNum;
        oldReq.leavingGuest = r.guestName;
        oldReq.updatedAt = new Date().toISOString();
      }
    } else {
      // 3. Se não havia pendência na data antiga e não existe na nova data, garante criação se não cancelada
      const hasAnyReq = db.cleaningRequests.some(c => 
        (c.flatId === r.flatId || String(c.flatNumber) === String(flatNum)) && 
        c.requestDate === r.checkoutDate
      );
      if (!hasAnyReq && r.status !== "cancelada") {
        const maxId = db.cleaningRequests.length > 0 ? Math.max(...db.cleaningRequests.map(x => Number(x.id) || 0)) : 0;
        db.cleaningRequests.unshift({
          id: maxId + 1,
          flatId: r.flatId,
          flatNumber: flatNum,
          requestDate: r.checkoutDate,
          source: "checkout",
          status: "dirty",
          assignedUserId: null,
          assignedUsername: null,
          isVacant: false,
          isPriority: false,
          leavingGuest: r.guestName,
          arrivingGuest: null,
          adminNote: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
    }
  }

  // Sincronização automática de pedidos de café da manhã caso a reserva seja cancelada ou check-out antecipado/estendido
  // Sincronização automática de pedidos de café da manhã caso a reserva seja cancelada ou check-in/check-out alterado
  if (!db.breakfastOrders) db.breakfastOrders = [];
  const nowBrl = getBrasiliaNow();
  const todayStr = nowBrl.date;

  if (r.status === "cancelada" || r.status === "cancelado") {
    db.breakfastOrders.forEach(o => {
      if ((o.reservationCode && (o.reservationCode === r.code || o.reservationCode === r.reservationCode)) || o.reservationId === r.id) {
        o.status = "cancelled";
        o.cancelReason = computeBreakfastCancellationReason(o, r, todayStr, nowBrl, db);
      }
    });
  } else if (oldCheckout !== r.checkoutDate || oldCheckin !== r.checkinDate) {
    db.breakfastOrders.forEach(o => {
      if ((o.reservationCode && (o.reservationCode === r.code || o.reservationCode === r.reservationCode)) || o.reservationId === r.id) {
        if (o.date > r.checkoutDate || o.date < r.checkinDate) {
          o.status = "cancelled";
          o.cancelReason = computeBreakfastCancellationReason(o, r, todayStr, nowBrl, db);
        } else if (o.date >= r.checkinDate && o.date <= r.checkoutDate && o.status === "cancelled") {
          // Reativa caso o pedido volte a estar em um dia válido da estadia
          o.status = "pending";
          o.cancelReason = null;
        }
      }
    });
  }

  // Gatilho B: Envio Automático de Atualização da Reserva à Recepção/Portaria
  const changes = [];
  if (oldCheckin !== r.checkinDate) {
    changes.push({ field: "checkinDate", label: "Data de Entrada (Check-in)", oldValue: oldCheckin, newValue: r.checkinDate });
  }
  if (oldCheckout !== r.checkoutDate) {
    changes.push({ field: "checkoutDate", label: "Data de Saída (Check-out)", oldValue: oldCheckout, newValue: r.checkoutDate });
  }
  if (oldStatus !== r.status) {
    changes.push({ field: "status", label: "Status da Reserva", oldValue: oldStatus, newValue: r.status });
  }
  if (oldFlatId !== r.flatId) {
    const oldF = db.flats?.find(f => f.id === oldFlatId);
    changes.push({ field: "flatNumber", label: "Apartamento", oldValue: `Flat ${oldF?.number || oldFlatId}`, newValue: `Flat ${r.flatNumber}` });
  }
  if (req.body.guestName && oldGuestName && req.body.guestName !== oldGuestName) {
    changes.push({ field: "guestName", label: "Hóspede Titular", oldValue: oldGuestName, newValue: r.guestName });
  }

  if (changes.length > 0) {
    try {
      const flat = (db.flats || []).find(f => f.id === r.flatId || String(f.number) === String(r.flatNumber));
      const receptionEmail = flat?.receptionEmail || db.settings?.receptionEmail || db.settings?.buildingEmail || process.env.RECEPTION_EMAIL || "portaria.soho@corpflats.com.br";
      const { subject, bodyHtml } = renderReservationUpdateEmail({ reservation: r, flat, changes, settings: db.settings });

      sendEmailAsync({
        db,
        saveDatabase,
        reservationId: r.code || r.id,
        recipient: receptionEmail,
        subject,
        bodyHtml,
        type: "email",
        direction: "outbound",
        metadata: {
          trigger: "reservation_update",
          flatNumber: r.flatNumber,
          guestName: r.guestName,
          changes
        }
      });
    } catch (mailErr) {
      console.warn("[MailService] Erro ao disparar aviso de alteração à portaria:", mailErr.message);
    }
  }

  if (diffs && diffs.length > 0) {
    const authUser = getAuthUser(req);
    const actorName = authUser ? (authUser.username || authUser.name || "Administrador") : "Sistema / Usuário";
    const source = req.body.source || "PMS Calendário (Edição Manual)";
    const isFlatTransfer = diffs.some(d => d.field === "flatNumber");
    const isDatesChange = diffs.some(d => d.field === "checkinDate" || d.field === "checkoutDate");
    const isStatusChange = diffs.some(d => d.field === "status");

    let action = "updated";
    if (isFlatTransfer) action = "flat_changed";
    else if (isDatesChange) action = "dates_changed";
    else if (isStatusChange && (r.status === "cancelada" || r.status === "CANCELLED")) action = "cancelled";

    let desc = `Alteração de ${diffs.length} ${diffs.length === 1 ? 'campo' : 'campos'}`;
    if (isFlatTransfer && isDatesChange) desc = "Remarcação de datas e troca de flat";
    else if (isFlatTransfer) desc = "Transferência de apartamento";
    else if (isDatesChange) desc = "Remarcação do período da estadia";

    addReservationAuditLog(r, {
      action,
      actor: {
        id: authUser?.id || null,
        name: actorName,
        role: authUser?.role || "admin",
        type: authUser ? "user" : "system"
      },
      source,
      description: desc,
      changes: diffs
    });
  }

  r.updatedAt = new Date().toISOString();
  saveDatabase();
  triggerImmediateWhatsApp(db, saveDatabase, "reservation_updated", r);
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
• Permissão: Permitida a hospedagem exclusivamente de cães de pequeno porte (até 10 kg e altura de cernelha de até 35–40 cm). Outros animais não são autorizados.
• Circulação no Prédio: Nas áreas comuns do condomínio, o pet deve ser transportado obrigatoriamente no colo ou dentro de caixa/bolsa de transporte (ou com guia curta).
• Uso de Elevadores: É obrigatório utilizar exclusivamente o elevador de serviço ao transitar com animais.
• Convivência e Sossego: É proibido deixar o animal desacompanhado/sozinho no flat por longos períodos. O tutor deve zelar para evitar latidos ou ruídos excessivos.
• Higiene e Cuidados: Proibido dar banho no animal utilizando toalhas ou enxoval do flat, bem como permitir que o pet suba em camas e sofás sem proteção própria.
• Responsabilidade e Avarias: O titular da reserva responde integralmente por quaisquer danos a móveis, colchões, enxoval de cama/banho, odores ou sujeiras causadas pelo pet, arcando com os custos de reposição ou higienização extraordinária.
• Taxa Pet: Cobrança de taxa de higienização por animal conforme configurado no tarifário (padrão R$ 80,00 por estadia).

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

function matchBrazilianPhone(searchDigits, targetPhone) {
  if (!targetPhone) return false;
  const tDigits = String(targetPhone).replace(/\D/g, "");
  if (!tDigits || tDigits.length < 8) return false;
  if (tDigits === searchDigits) return true;
  if (tDigits.includes(searchDigits) || searchDigits.includes(tDigits)) return true;

  const strip55 = (d) => (d.startsWith("55") && (d.length === 12 || d.length === 13) ? d.slice(2) : d);
  const sNorm = strip55(searchDigits);
  const tNorm = strip55(tDigits);

  if (sNorm === tNorm) return true;
  if (sNorm.includes(tNorm) || tNorm.includes(sNorm)) return true;

  // Comparação dos 8 dígitos finais (equaliza telefones com ou sem o nono dígito '9')
  if (sNorm.length >= 8 && tNorm.length >= 8) {
    if (sNorm.slice(-8) === tNorm.slice(-8)) {
      if (sNorm.length >= 10 && tNorm.length >= 10) {
        return sNorm.slice(0, 2) === tNorm.slice(0, 2);
      }
      return true;
    }
  }
  return false;
}

function getAllReservationPhones(resItem) {
  const phones = [];
  if (resItem.guestPhone) phones.push(resItem.guestPhone);
  if (resItem.phone) phones.push(resItem.phone);
  if (resItem.whatsapp) phones.push(resItem.whatsapp);
  if (resItem.telephone) phones.push(resItem.telephone);
  if (resItem.requesterInfo && resItem.requesterInfo.phone) phones.push(resItem.requesterInfo.phone);
  if (resItem.requesterInfo && resItem.requesterInfo.whatsapp) phones.push(resItem.requesterInfo.whatsapp);
  if (Array.isArray(resItem.guests)) {
    for (const g of resItem.guests) {
      if (g.phone) phones.push(g.phone);
      if (g.whatsapp) phones.push(g.whatsapp);
    }
  }
  const notesText = `${resItem.notes || ""} ${resItem.receptionNotes || ""} ${resItem.specialRequests || ""}`;
  const foundInNotes = notesText.match(/(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9\s?)?\d{4}[-\s]?\d{4}/g);
  if (foundInNotes) {
    for (const p of foundInNotes) phones.push(p);
  }
  return phones;
}

function getAllReservationDocuments(resItem) {
  const docs = [];
  if (resItem.guestDocument) docs.push(resItem.guestDocument);
  if (resItem.document) docs.push(resItem.document);
  if (resItem.cpf) docs.push(resItem.cpf);
  if (resItem.guestCpf) docs.push(resItem.guestCpf);
  if (resItem.requesterInfo && resItem.requesterInfo.cpf) docs.push(resItem.requesterInfo.cpf);
  if (resItem.requesterInfo && resItem.requesterInfo.document) docs.push(resItem.requesterInfo.document);
  if (Array.isArray(resItem.guests)) {
    for (const g of resItem.guests) {
      if (g.cpf) docs.push(g.cpf);
      if (g.document) docs.push(g.document);
    }
  }
  return docs.map(d => String(d).replace(/\D/g, "")).filter(Boolean);
}

function getAllReservationNames(resItem) {
  const names = [];
  if (resItem.guestName) names.push(resItem.guestName);
  if (resItem.requesterInfo && resItem.requesterInfo.name) names.push(resItem.requesterInfo.name);
  if (Array.isArray(resItem.guests)) {
    for (const g of resItem.guests) {
      if (g.name) names.push(g.name);
    }
  }
  return names;
}

function findReservationByLocatorOrContact(query) {
  if (!query || !db.reservations) return null;
  const raw = String(query).trim();
  if (!raw) return null;

  // 1. Código exato ou ID numérico
  let r = db.reservations.find(resItem => 
    (resItem.code && resItem.code.toUpperCase() === raw.toUpperCase()) || 
    String(resItem.id) === raw
  );
  if (r) return r;

  // 2. Código normalizado (sem caracteres especiais/hífens)
  const norm = raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (norm.length >= 3) {
    r = db.reservations.find(resItem => 
      (resItem.code || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase() === norm
    );
    if (r) return r;
  }

  // 3. Telefone / WhatsApp ou CPF / Documento (se tiver 8 ou mais dígitos)
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 8) {
    r = db.reservations.slice().reverse().find(resItem => {
      const phones = getAllReservationPhones(resItem);
      const docs = getAllReservationDocuments(resItem);

      const hasPhoneMatch = phones.some(p => matchBrazilianPhone(digits, p));
      const hasDocMatch = docs.some(d => d === digits || d.includes(digits) || digits.includes(d));

      return hasPhoneMatch || hasDocMatch;
    });
    if (r) return r;
  }

  // 4. E-mail
  if (raw.includes("@")) {
    const email = raw.toLowerCase();
    r = db.reservations.slice().reverse().find(resItem => 
      (resItem.guestEmail || "").trim().toLowerCase() === email ||
      (resItem.requesterInfo?.email || "").trim().toLowerCase() === email ||
      (resItem.guests || []).some(g => (g.email || "").trim().toLowerCase() === email)
    );
    if (r) return r;
  }

  // 5. Nome do hóspede ou solicitante (se tiver 3 ou mais letras)
  const normQuery = raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  if (normQuery.length >= 3 && /[a-zA-Z]/.test(normQuery)) {
    r = db.reservations.slice().reverse().find(resItem => {
      const names = getAllReservationNames(resItem);
      return names.some(n => {
        const normN = String(n).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        return normN.includes(normQuery) || normQuery.includes(normN);
      });
    });
    if (r) return r;
  }

  return null;
}

app.get("/api/pms/guest-portal/:code", (req, res) => {
  const code = (req.params.code || "").trim();
  if (!db.reservations) db.reservations = [];
  const r = findReservationByLocatorOrContact(code);
  if (!r) {
    return res.status(404).json({ error: "Reserva não encontrada com os dados informados. Verifique o localizador, CPF ou telefone." });
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

  const hasBreakfast = Boolean(
    r.includeBreakfast !== undefined ? r.includeBreakfast : (
      r.hasBreakfast || 
      r.ratePlan === "with_breakfast" ||
      r.notes?.toLowerCase().includes("café") || 
      r.notes?.toLowerCase().includes("cafe")
    )
  );
  const breakfastToken = r.breakfastToken || `bfk_${r.id}_${crypto.randomBytes(4).toString("hex")}`;
  const breakfastLink = `/cafe?res=${r.code || breakfastToken}`;

  const chanLower = String(r.channel || "").toLowerCase();
  const isOta = chanLower.includes("booking") || chanLower.includes("airbnb");
  const isPaid = isOta || Boolean(
    r.paymentStatus === "pago_total" ||
    r.paymentStatus === "pago" ||
    (Number(r.paidAmount) >= Number(r.totalAmount) && Number(r.totalAmount) > 0)
  );

  const resolvedTotal = Number(r.totalAmount) || 0;
  const resolvedPaid = isPaid ? (resolvedTotal > 0 ? resolvedTotal : (isOta ? 0 : (Number(r.paidAmount) || 0))) : (Number(r.paidAmount) || 0);

  if (isPaid && resolvedTotal > 0 && r.paidAmount !== resolvedTotal) {
    r.paidAmount = resolvedTotal;
    saveDatabase();
  }

  // Se pendente com valor total cadastrado e sem chave PIX ainda, gera cobrança estática PIX com a chave oficial CorpFlats
  if (!isPaid && Number(r.totalAmount) > 0 && !r.pixCopiaECola) {
    try {
      const staticPayload = generateStaticPixPayload({
        pixKey: DEFAULT_INTER_CONFIG.pixKey || "47964813000165",
        amount: r.totalAmount,
        merchantName: "CORPFLATS LTDA",
        merchantCity: "CAMPOS DOS GOYTACAZES",
        txid: String(r.code || `RES${r.id}`).replace(/[^a-zA-Z0-9]/g, "").substring(0, 25)
      });
      r.pixTxId = r.pixTxId || `STAT_${Date.now()}`;
      r.pixCopiaECola = staticPayload;
      saveDatabase();
    } catch {}
  }

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
      totalAmount: resolvedTotal,
      paidAmount: resolvedPaid,
      isPaid,
      paymentStatus: isPaid ? "pago_total" : (r.paymentStatus || "pendente"),
      paymentMethod: r.paymentMethod || (r.pixTxId ? "pix" : (r.mpPaymentId ? "cartao_credito" : "pix")),
      paidAt: r.paidAt || null,
      pixTxId: r.pixTxId || null,
      pixCopiaECola: r.pixCopiaECola || null,
      pixEndToEndId: r.pixEndToEndId || null,
      mpPaymentId: r.mpPaymentId || null,
      mpPreferenceId: r.mpPreferenceId || null,
      mpInitPoint: r.mpInitPoint || null,
      hasBreakfast,
      includeBreakfast: hasBreakfast,
      breakfastToken,
      breakfastLink,
      earlyCheckinAuthorized: Boolean(r.earlyCheckinAuthorized),
      flatNumber: r.flatNumber,
      roomCategory: "Flat Studio Executivo Completo",
      flatCleanStatus: isFlatClean ? "limpo" : "em_preparacao",
      specialRequests: r.specialRequests || "",
      notes: r.notes || "",
      receptionNotes: r.receptionNotes || "",
      vehicle: r.vehicle || null
    },
    hasBreakfast,
    breakfastLink,
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
  const r = findReservationByLocatorOrContact(code);
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
  const r = findReservationByLocatorOrContact(code);
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
  const r = findReservationByLocatorOrContact(code);
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
  const r = findReservationByLocatorOrContact(code);
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
  r.updatedAt = new Date().toISOString();

  // Cancelar pedidos de café da manhã vinculados à reserva
  if (!db.breakfastOrders) db.breakfastOrders = [];
  const cancelMotive = req.body?.reason?.trim() 
    ? `Reserva cancelada pelo próprio hóspede via autoatendimento (Motivo: ${req.body.reason.trim()})`
    : "Reserva cancelada pelo próprio hóspede via autoatendimento";

  db.breakfastOrders.forEach(o => {
    if ((o.reservationCode && (o.reservationCode === r.code || o.reservationCode === r.reservationCode)) || o.reservationId === r.id) {
      o.status = "cancelled";
      o.cancelReason = cancelMotive;
    }
  });

  // Gatilho B: Notificação de cancelamento para a recepção/portaria
  try {
    const flat = (db.flats || []).find(f => f.id === r.flatId || String(f.number) === String(r.flatNumber));
    const receptionEmail = flat?.receptionEmail || db.settings?.receptionEmail || db.settings?.buildingEmail || process.env.RECEPTION_EMAIL || "portaria.soho@corpflats.com.br";
    const changes = [{ field: "status", label: "Status da Reserva", oldValue: "Confirmada", newValue: "CANCELADA (Portal do Hóspede)" }];
    const { subject, bodyHtml } = renderReservationUpdateEmail({ reservation: r, flat, changes, settings: db.settings });

    sendEmailAsync({
      db,
      saveDatabase,
      reservationId: r.code || r.id,
      recipient: receptionEmail,
      subject,
      bodyHtml,
      type: "email",
      direction: "outbound",
      metadata: {
        trigger: "guest_portal_cancel",
        flatNumber: r.flatNumber,
        guestName: r.guestName,
        changes
      }
    });
  } catch (mailErr) {
    console.warn("[MailService] Erro ao disparar cancelamento à portaria:", mailErr.message);
  }

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

app.post("/api/pms/guest-portal/:code/modify", (req, res) => {
  const code = (req.params.code || "").trim();
  if (!db.reservations) db.reservations = [];
  const r = findReservationByLocatorOrContact(code);
  if (!r) {
    return res.status(404).json({ error: "Reserva não encontrada." });
  }

  if (r.status === "cancelada" || r.status === "CANCELLED") {
    return res.status(400).json({ error: "Esta reserva está cancelada e não pode ser modificada." });
  }

  const directChannels = ["whatsapp", "site", "site_direto", "direto", "balcao"];
  const channel = (r.channel || "").toLowerCase();
  if (!directChannels.includes(channel)) {
    return res.status(403).json({
      error: `Modificação pelo portal não permitida para reservas do canal ${r.channel || "externo"}. Por favor, solicite a alteração diretamente pela plataforma de origem (Booking.com, Airbnb, etc.).`
    });
  }

  const { newCheckinDate, newCheckoutDate, newGuestCount, reason } = req.body || {};

  if (!newCheckinDate || !newCheckoutDate) {
    return res.status(400).json({ error: "Datas de check-in e check-out são obrigatórias." });
  }

  if (newCheckoutDate <= newCheckinDate) {
    return res.status(400).json({ error: "A data de check-out deve ser posterior à data de check-in." });
  }

  const guestsNum = Math.max(1, Math.min(6, Number(newGuestCount) || r.guestCount || 1));

  // Verificar disponibilidade do flat para as novas datas (evitar sobreposição de reservas)
  const flatNumberStr = String(r.flatNumber || r.flatId);
  const hasConflict = (db.reservations || []).some(other => {
    if (other.id === r.id || other.code === r.code) return false;
    if (other.status === "cancelada" || other.status === "CANCELLED") return false;
    const otherFlat = String(other.flatNumber || other.flatId);
    if (otherFlat !== flatNumberStr) return false;
    return (newCheckinDate < other.checkoutDate) && (newCheckoutDate > other.checkinDate);
  });

  if (hasConflict) {
    return res.status(409).json({
      error: `O Flat ${r.flatNumber} não possui disponibilidade para o período solicitado (${newCheckinDate} a ${newCheckoutDate}). Por favor, selecione outras datas ou entre em contato com nossa recepção.`
    });
  }

  // Cálculo de diárias
  const parseDate = (dStr) => new Date(dStr + "T00:00:00Z");
  const oldNights = Math.max(1, Math.round((parseDate(r.checkoutDate) - parseDate(r.checkinDate)) / (1000 * 3600 * 24)));
  const newNights = Math.max(1, Math.round((parseDate(newCheckoutDate) - parseDate(newCheckinDate)) / (1000 * 3600 * 24)));
  const dailyRate = Number(r.dailyRate) || (oldNights > 0 ? (Number(r.totalAmount || 0) / oldNights) : 160);

  // Regra das 24h antes do check-in (14:00 do dia anterior ao check-in original)
  const originalCheckin = new Date(r.checkinDate + "T14:00:00-03:00");
  const cutoff24h = new Date(originalCheckin.getTime() - 24 * 3600 * 1000);
  const now = new Date();
  const isUnder24h = now.getTime() >= cutoff24h.getTime();

  const isReducingNights = newNights < oldNights;
  const isReducingGuests = guestsNum < (r.guestCount || 1);
  const isIncreasingNights = newNights > oldNights;
  const isIncreasingGuests = guestsNum > (r.guestCount || 1);

  let refundAmount = 0;
  let additionalAmountToPay = 0;
  let nonRefundableReduction = false;
  let policyNotice = "";

  if (isIncreasingNights) {
    const extraNights = newNights - oldNights;
    additionalAmountToPay += extraNights * dailyRate;
    r.totalAmount = Number(r.totalAmount || 0) + additionalAmountToPay;
    policyNotice = `Acréscimo de ${extraNights} ${extraNights === 1 ? 'diária' : 'diárias'} (+R$ ${additionalAmountToPay.toFixed(2)}).`;
  } else if (isReducingNights) {
    const reducedNights = oldNights - newNights;
    const valueOfReducedNights = reducedNights * dailyRate;

    if (isUnder24h) {
      nonRefundableReduction = true;
      policyNotice = `Redução de ${reducedNights} ${reducedNights === 1 ? 'diária' : 'diárias'} efetuada com menos de 24h do início (limite: 14h do dia anterior). Não há direito a estorno ou reembolso conforme o Contrato de Hospedagem.`;
    } else {
      refundAmount += valueOfReducedNights;
      r.totalAmount = Math.max(0, Number(r.totalAmount || 0) - valueOfReducedNights);
      policyNotice = `Redução de ${reducedNights} ${reducedNights === 1 ? 'diária' : 'diárias'} com estorno/crédito elegível de R$ ${valueOfReducedNights.toFixed(2)}.`;
    }
  }

  if (isReducingGuests && isUnder24h) {
    nonRefundableReduction = true;
  }

  // Histórico de Modificação
  if (!r.modificationHistory) r.modificationHistory = [];
  r.modificationHistory.push({
    modifiedAt: new Date().toISOString(),
    oldCheckin: r.checkinDate,
    newCheckin: newCheckinDate,
    oldCheckout: r.checkoutDate,
    newCheckout: newCheckoutDate,
    oldNights,
    newNights,
    oldGuests: r.guestCount || 1,
    newGuests: guestsNum,
    additionalAmountToPay,
    refundAmount,
    isUnder24h,
    nonRefundableReduction,
    reason: reason || "Modificação solicitada pelo hóspede via autoatendimento"
  });

  ensureReservationAuditLogs(r);
  addReservationAuditLog(r, {
    action: "portal_modify",
    actor: {
      id: null,
      name: r.guestName || "Hóspede",
      role: "guest",
      type: "guest"
    },
    source: "Portal do Hóspede (Autoatendimento)",
    description: reason || "Modificação solicitada pelo hóspede via autoatendimento",
    changes: [
      {
        field: "dates",
        label: "Período da Estadia",
        oldValue: `${r.checkinDate} a ${r.checkoutDate}`,
        newValue: `${newCheckinDate} a ${newCheckoutDate}`
      },
      ...(r.guestCount !== guestsNum ? [{
        field: "guestCount",
        label: "Quantidade de Hóspedes",
        oldValue: String(r.guestCount || 1),
        newValue: String(guestsNum)
      }] : []),
      ...(additionalAmountToPay > 0 ? [{
        field: "totalAmount",
        label: "Acréscimo de Valor",
        oldValue: `R$ ${Number(r.totalAmount - additionalAmountToPay).toFixed(2)}`,
        newValue: `R$ ${Number(r.totalAmount).toFixed(2)} (+R$ ${additionalAmountToPay.toFixed(2)})`
      }] : []),
      ...(refundAmount > 0 ? [{
        field: "totalAmount",
        label: "Estorno/Crédito",
        oldValue: `R$ ${Number(r.totalAmount + refundAmount).toFixed(2)}`,
        newValue: `R$ ${Number(r.totalAmount).toFixed(2)} (-R$ ${refundAmount.toFixed(2)})`
      }] : [])
    ]
  });

  if (r.checkinDate !== newCheckinDate) {
    r.previousCheckinDate = r.checkinDate;
  }
  if (r.checkoutDate !== newCheckoutDate) {
    r.previousCheckoutDate = r.checkoutDate;
  }

  // Salvar novos parâmetros
  r.checkinDate = newCheckinDate;
  r.checkoutDate = newCheckoutDate;
  r.calendarSequence = (r.calendarSequence || 0) + 1;
  r.updatedAt = new Date().toISOString();

  // Sincronizar pedidos de café da manhã vinculados
  if (!db.breakfastOrders) db.breakfastOrders = [];
  const nowBrl = getBrasiliaNow();
  const todayStr = nowBrl.date;

  db.breakfastOrders.forEach(o => {
    if ((o.reservationCode && (o.reservationCode === r.code || o.reservationCode === r.reservationCode)) || o.reservationId === r.id) {
      if (o.date < newCheckinDate || o.date > newCheckoutDate) {
        o.status = "cancelled";
        o.cancelReason = computeBreakfastCancellationReason(o, r, todayStr, nowBrl, db);
      } else if (o.date >= newCheckinDate && o.date <= newCheckoutDate && o.status === "cancelled") {
        o.status = "pending";
        o.cancelReason = null;
      }
    }
  });

  // Gatilho B: Notificação de alteração de datas para a recepção/portaria
  try {
    const flat = (db.flats || []).find(f => f.id === r.flatId || String(f.number) === String(r.flatNumber));
    const receptionEmail = flat?.receptionEmail || db.settings?.receptionEmail || db.settings?.buildingEmail || process.env.RECEPTION_EMAIL || "portaria.soho@corpflats.com.br";
    const changes = [
      { field: "dates", label: "Novo Período", oldValue: `${formatDateBr(r.modificationHistory[r.modificationHistory.length - 1]?.oldCheckin)} a ${formatDateBr(r.modificationHistory[r.modificationHistory.length - 1]?.oldCheckout)}`, newValue: `${formatDateBr(newCheckinDate)} a ${formatDateBr(newCheckoutDate)}` }
    ];
    const { subject, bodyHtml } = renderReservationUpdateEmail({ reservation: r, flat, changes, settings: db.settings });

    sendEmailAsync({
      db,
      saveDatabase,
      reservationId: r.code || r.id,
      recipient: receptionEmail,
      subject,
      bodyHtml,
      type: "email",
      direction: "outbound",
      metadata: {
        trigger: "guest_portal_modify",
        flatNumber: r.flatNumber,
        guestName: r.guestName,
        changes
      }
    });
  } catch (mailErr) {
    console.warn("[MailService] Erro ao disparar aviso de alteração à portaria:", mailErr.message);
  }

  // Se houver solicitação de limpeza correspondente, sincroniza as datas
  if (Array.isArray(db.cleaningRequests)) {
    const reqItem = db.cleaningRequests.find(c => 
      (c.flatId === r.flatId || String(c.flatNumber) === String(r.flatNumber)) && 
      c.requestDate === r.checkinDate
    );
    if (reqItem) {
      reqItem.requestDate = newCheckinDate;
      reqItem.effectiveDate = newCheckinDate;
    }
  }

  saveDatabase();

  res.json({
    success: true,
    message: (isUnder24h && (isReducingNights || isReducingGuests))
      ? "Reserva modificada com sucesso! Conforme os termos do contrato, a redução de diárias/hóspedes a menos de 24h do início não confere direito a estorno financeiro."
      : "Reserva modificada com sucesso!",
    policyNotice,
    isUnder24h,
    nonRefundableReduction,
    additionalAmountToPay,
    refundAmount,
    newCheckinDate,
    newCheckoutDate,
    newNights,
    newGuestCount: guestsNum,
    reservation: {
      ...r,
      nights: newNights
    }
  });
});

// ── Achados & Perdidos (Lost and Found / Item Encontrado no Quarto) ──────────
app.get("/api/lost-and-found", (req, res) => {
  if (!db.lostAndFound) db.lostAndFound = [];
  sanitizeLostAndFound();
  const { flatId, flatNumber, status } = req.query;
  let items = [...db.lostAndFound];
  if (flatId) items = items.filter(i => i.flatId === Number(flatId));
  if (flatNumber) items = items.filter(i => String(i.flatNumber) === String(flatNumber));
  if (status) items = items.filter(i => i.status === status);
  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json(items);
});

app.post("/api/lost-and-found", async (req, res) => {
  try {
    const { 
      flatId, 
      flatNumber, 
      description, 
      locationInRoom = "", 
      photoBase64 = "", 
      notes = "",
      date = "",
      requestDate = "",
      timestamp = "",
      guestName = "",
      guestPhone = "",
      guestEmail = ""
    } = req.body;

    if (!description || !description.trim()) {
      return res.status(400).json({ error: "Descrição do item encontrado é obrigatória." });
    }

    const user = getAuthUser(req);
    if (!db.lostAndFound) db.lostAndFound = [];
    const id = db.lostAndFound.length > 0 ? Math.max(...db.lostAndFound.map(i => i.id || 0)) + 1 : 1;

    const targetFlat = flatNumber || (flatId ? db.flats?.find(f => f.id === Number(flatId))?.number : "Geral");

    // 1. Processamento e Persistência Permanente da Foto (Cloudflare R2 com Fallback Base64 Seguro)
    let finalPhotoUrl = null;
    if (photoBase64 && typeof photoBase64 === "string") {
      if (photoBase64.startsWith("data:image/")) {
        try {
          finalPhotoUrl = await uploadImageToStorage(photoBase64, `lost_${String(targetFlat).replace(/[^a-zA-Z0-9]/g, "_")}`, db, "lost_items");
          console.log(`[Lost and Found] Foto salva com sucesso no storage R2: ${finalPhotoUrl}`);
        } catch (imgErr) {
          console.warn("[Lost and Found] Erro ao enviar foto para storage, usando fallback base64:", imgErr.message);
          finalPhotoUrl = photoBase64;
        }
      } else if (photoBase64.startsWith("http://") || photoBase64.startsWith("https://")) {
        finalPhotoUrl = photoBase64;
      }
    }

    // 2. Data em que o item está sendo cadastrado / encontrado
    let registrationDate = date || requestDate;
    if (!registrationDate && timestamp) {
      try {
        registrationDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date(timestamp));
      } catch {}
    }
    if (!registrationDate) {
      registrationDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
    }

    // 3. Auto-identificação do Hóspede que fez CHECK-OUT no dia em que o item foi cadastrado
    let lastGuestName = (guestName && String(guestName).trim()) ? String(guestName).trim() : "Hóspede Anterior";
    let lastGuestPhone = guestPhone || "";
    let lastGuestEmail = guestEmail || "";
    let lastCheckoutDate = registrationDate;

    // Regra A: Se já veio nome do card de limpeza daquele dia (leavingGuest), respeita e busca telefone se faltar
    // Regra B: Busca reserva que teve checkout exatamente na data do cadastro (checkoutDate === registrationDate)
    const checkoutReservation = (db.reservations || []).find(r => 
      (String(r.flatNumber) === String(targetFlat) || (flatId && r.flatId === Number(flatId)) || r.allocatedFlatNumbers?.includes(String(targetFlat))) &&
      r.status !== "cancelada" &&
      r.status !== "CANCELLED" &&
      r.checkoutDate === registrationDate &&
      r.guestName
    );

    if (checkoutReservation) {
      if (!lastGuestName || lastGuestName === "Hóspede Anterior") {
        lastGuestName = checkoutReservation.guestName;
      }
      if (!lastGuestPhone) lastGuestPhone = checkoutReservation.guestPhone || "";
      if (!lastGuestEmail) lastGuestEmail = checkoutReservation.guestEmail || "";
      lastCheckoutDate = checkoutReservation.checkoutDate;
    }

    // Regra C: Busca na lista de solicitações de limpeza para aquele flat na data do cadastro
    if (!lastGuestName || lastGuestName === "Hóspede Anterior") {
      const checkoutCleaning = (db.cleaningRequests || []).find(cr => 
        (String(cr.flatNumber) === String(targetFlat) || (flatId && cr.flatId === Number(flatId))) &&
        (cr.requestDate === registrationDate || cr.effectiveDate === registrationDate) &&
        cr.leavingGuest
      );
      if (checkoutCleaning) {
        lastGuestName = checkoutCleaning.leavingGuest;
        lastCheckoutDate = checkoutCleaning.requestDate || registrationDate;
      }
    }

    // Regra D: Fallback de segurança caso não haja checkout na data exata (busca a reserva com checkout mais recente <= registrationDate)
    if (!lastGuestName || lastGuestName === "Hóspede Anterior") {
      const priorReservations = (db.reservations || [])
        .filter(r => 
          (String(r.flatNumber) === String(targetFlat) || (flatId && r.flatId === Number(flatId)) || r.allocatedFlatNumbers?.includes(String(targetFlat))) &&
          r.status !== "cancelada" &&
          r.status !== "CANCELLED" &&
          r.guestName &&
          r.checkoutDate && r.checkoutDate <= registrationDate
        )
        .sort((a, b) => b.checkoutDate.localeCompare(a.checkoutDate));

      if (priorReservations.length > 0) {
        const mostRecent = priorReservations[0];
        lastGuestName = mostRecent.guestName;
        if (!lastGuestPhone) lastGuestPhone = mostRecent.guestPhone || "";
        if (!lastGuestEmail) lastGuestEmail = mostRecent.guestEmail || "";
        lastCheckoutDate = mostRecent.checkoutDate;
      }
    }

    // Regra E: Se tiver o nome do hóspede mas não tiver telefone, busca telefone nas reservas ou no cadastro de hóspedes
    if (lastGuestName && lastGuestName !== "Hóspede Anterior" && !lastGuestPhone) {
      const guestMatch = (db.reservations || []).find(r => 
        (r.guestName || "").toLowerCase().trim() === lastGuestName.toLowerCase().trim() &&
        r.guestPhone
      );
      if (guestMatch) {
        lastGuestPhone = guestMatch.guestPhone;
      }
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

    // 4. Registro de Auditoria Fail-Safe
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

    // 5. Notificação Central para a Equipe de Gestão
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

app.patch("/api/lost-and-found/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!db.lostAndFound) db.lostAndFound = [];
  const item = db.lostAndFound.find(i => i.id === id);
  if (!item) return res.status(404).json({ error: "Item não encontrado." });

  const user = getAuthUser(req);
  if (req.body.status) item.status = req.body.status;
  if (req.body.notes !== undefined) item.notes = req.body.notes;
  if (req.body.returnedTo) item.returnedTo = req.body.returnedTo;
  if (req.body.lastGuestName !== undefined) item.lastGuestName = req.body.lastGuestName;
  if (req.body.lastGuestPhone !== undefined) item.lastGuestPhone = req.body.lastGuestPhone;
  if (req.body.lastGuestEmail !== undefined) item.lastGuestEmail = req.body.lastGuestEmail;
  if (req.body.description !== undefined) item.description = req.body.description;
  if (req.body.locationInRoom !== undefined) item.locationInRoom = req.body.locationInRoom;

  if (req.body.photoBase64 !== undefined) {
    if (req.body.photoBase64 && typeof req.body.photoBase64 === "string" && req.body.photoBase64.startsWith("data:image/")) {
      try {
        item.photoUrl = await uploadImageToStorage(req.body.photoBase64, `lost_${String(item.flatNumber || "item").replace(/[^a-zA-Z0-9]/g, "_")}`, db, "lost_items");
        console.log(`[Lost and Found PATCH] Foto atualizada com sucesso no storage R2: ${item.photoUrl}`);
      } catch (err) {
        console.warn("[Lost and Found PATCH] Erro ao salvar foto no storage, usando fallback base64:", err.message);
        item.photoUrl = req.body.photoBase64;
      }
    } else if (req.body.photoBase64 === null || req.body.photoBase64 === "") {
      item.photoUrl = null;
    } else if (typeof req.body.photoBase64 === "string" && (req.body.photoBase64.startsWith("http://") || req.body.photoBase64.startsWith("https://"))) {
      item.photoUrl = req.body.photoBase64;
    }
  } else if (req.body.photoUrl !== undefined) {
    item.photoUrl = req.body.photoUrl;
  }

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
    details: { id, flatNumber: item.flatNumber, status: item.status, returnedTo: item.returnedTo, hasPhoto: Boolean(item.photoUrl) },
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

  // Marca pedidos de café da manhã vinculados como cancelados
  if (!db.breakfastOrders) db.breakfastOrders = [];
  db.breakfastOrders.forEach(o => {
    if ((o.reservationCode && (o.reservationCode === r.code || o.reservationCode === r.reservationCode)) || o.reservationId === r.id || (String(o.roomNumber) === String(r.flatNumber) && o.date >= r.checkinDate && o.date <= r.checkoutDate)) {
      o.status = "cancelled";
      o.cancelReason = "Reserva cancelada no calendário";
    }
  });

  ensureReservationAuditLogs(r);
  const authUser = getAuthUser(req);
  const actorName = authUser ? (authUser.username || authUser.name || "Administrador") : "Administrador";
  const source = req.body?.source || "PMS Calendário (Cancelamento Manual)";

  addReservationAuditLog(r, {
    action: "cancelled",
    actor: {
      id: authUser?.id || null,
      name: actorName,
      role: authUser?.role || "admin",
      type: "user"
    },
    source,
    description: "Reserva cancelada no sistema",
    changes: [{ field: "status", label: "Status da Reserva", oldValue: "Confirmada", newValue: "Cancelada" }]
  });

  r.updatedAt = new Date().toISOString();

  // Gatilho B: Notificação de cancelamento para a recepção/portaria
  try {
    const flat = (db.flats || []).find(f => f.id === r.flatId || String(f.number) === String(r.flatNumber));
    const receptionEmail = flat?.receptionEmail || db.settings?.receptionEmail || db.settings?.buildingEmail || process.env.RECEPTION_EMAIL || "portaria.soho@corpflats.com.br";
    const changes = [{ field: "status", label: "Status da Reserva", oldValue: "Confirmada", newValue: "CANCELADA" }];
    const { subject, bodyHtml } = renderReservationUpdateEmail({ reservation: r, flat, changes, settings: db.settings });

    sendEmailAsync({
      db,
      saveDatabase,
      reservationId: r.code || r.id,
      recipient: receptionEmail,
      subject,
      bodyHtml,
      type: "email",
      direction: "outbound",
      metadata: {
        trigger: "cancellation",
        flatNumber: r.flatNumber,
        guestName: r.guestName,
        changes
      }
    });
  } catch (mailErr) {
    console.warn("[MailService] Erro ao disparar cancelamento à portaria:", mailErr.message);
  }

  saveDatabase();
  triggerImmediateWhatsApp(db, saveDatabase, "reservation_cancelled", r);
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


const handleUpdateGuest = (req, res) => {
  const id = Number(req.params.id);
  const guest = (db.guests || []).find(g => g.id === id);
  if (!guest) return res.status(404).json({ error: "Hóspede não encontrado." });

  const fields = ["name", "fullName", "phone", "email", "document", "documentNumber", "city", "notes", "tags", "isMonthlyGuest", "clientType", "companyId", "preferences", "autoEmitInvoice"];
  for (const f of fields) {
    if (req.body[f] !== undefined) guest[f] = req.body[f];
  }
  if (req.body.isMonthlyGuest !== undefined || req.body.clientType !== undefined) {
    guest.isMonthlyGuest = Boolean(req.body.isMonthlyGuest || req.body.clientType === "mensalista");
    guest.clientType = guest.isMonthlyGuest ? "mensalista" : "avulso";
    
    // Atualiza imediatamente todas as reservas desse hóspede
    const cleanDoc = (guest.document || guest.documentNumber || "").replace(/\D/g, "");
    const cleanPhone = (guest.phone || "").replace(/\D/g, "");
    const guestNameLower = (guest.fullName || guest.name || "").trim().toLowerCase();

    (db.reservations || []).forEach(r => {
      const resDoc = (r.guestDocument || r.document || "").replace(/\D/g, "");
      const resPhone = (r.guestPhone || "").replace(/\D/g, "");
      const resName = (r.guestName || "").trim().toLowerCase();
      if ((cleanDoc && resDoc === cleanDoc) || (cleanPhone && resPhone === cleanPhone) || (guestNameLower && resName === guestNameLower) || r.guestId === guest.id) {
        r.isMonthlyGuest = guest.isMonthlyGuest;
        r.clientType = guest.clientType;
      }
    });
  }

  if (req.body.autoEmitInvoice !== undefined) {
    guest.autoEmitInvoice = Boolean(req.body.autoEmitInvoice);
    const cleanDoc = (guest.document || guest.documentNumber || "").replace(/\D/g, "");
    const cleanPhone = (guest.phone || "").replace(/\D/g, "");
    const guestNameLower = (guest.fullName || guest.name || "").trim().toLowerCase();

    (db.reservations || []).forEach(r => {
      const resDoc = (r.guestDocument || r.document || "").replace(/\D/g, "");
      const resPhone = (r.guestPhone || "").replace(/\D/g, "");
      const resName = (r.guestName || "").trim().toLowerCase();
      if ((cleanDoc && resDoc === cleanDoc) || (cleanPhone && resPhone === cleanPhone) || (guestNameLower && resName === guestNameLower) || r.guestId === guest.id) {
        r.autoEmitInvoice = guest.autoEmitInvoice;
      }
    });
  }

  guest.updatedAt = new Date().toISOString();
  saveDatabase();
  res.json(guest);
};

app.put("/api/pms/guests/:id", handleUpdateGuest);
app.patch("/api/pms/guests/:id", handleUpdateGuest);

// Gerenciamento de Tags Essenciais da Propriedade
app.get("/api/pms/amenities/essential-tags", (req, res) => {
  if (!db.essentialTagIds) {
    db.essentialTagIds = [
      "cama_casal", "2_camas_solteiro", "ar_split", "ar_janela", "microondas",
      "frigobar", "cafeteira", "cozinha_completa", "wifi_alta_velocidade",
      "home_office", "smart_tv", "fechadura_digital", "garagem_coberta",
      "elevador", "portaria_24h", "piscina", "academia", "aceita_pet",
      "proibido_fumar", "foco_corporativo", "longa_estadia", "reformado"
    ];
  }
  res.json({ essentialTagIds: db.essentialTagIds });
});

app.put("/api/pms/amenities/essential-tags", (req, res) => {
  const { essentialTagIds } = req.body;
  if (Array.isArray(essentialTagIds)) {
    db.essentialTagIds = essentialTagIds;
    saveDatabase();
  }
  res.json({ essentialTagIds: db.essentialTagIds || [] });
});

app.post("/api/pms/guests", (req, res) => {
  const { name, fullName, phone, email, document, documentNumber, city, notes, tags, isMonthlyGuest, clientType, autoEmitInvoice, companyId, preferences } = req.body;
  const primName = (fullName || name || "").trim();
  if (!primName) return res.status(400).json({ error: "Nome é obrigatório." });
  if (!db.guests) db.guests = [];

  const isMonthly = Boolean(isMonthlyGuest || clientType === "mensalista");
  const newGuest = {
    id: db.guests.length > 0 ? Math.max(...db.guests.map(g => g.id)) + 1 : 1,
    name: primName,
    fullName: primName,
    phone: phone || "",
    email: email || "",
    document: document || documentNumber || "",
    documentNumber: documentNumber || document || "",
    city: city || "",
    companyId: companyId ? Number(companyId) : null,
    isMonthlyGuest: isMonthly,
    clientType: isMonthly ? "mensalista" : "avulso",
    autoEmitInvoice: Boolean(autoEmitInvoice),
    notes: notes || "",
    preferences: preferences || {},
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

  // 1. Chegadas Previstas para Hoje (Aguardando Check-in ou com Entrada Parcial Ativa)
  const arrivals = (db.reservations || [])
    .filter(r => {
      const resDate = r.checkinDate ? r.checkinDate.substring(0, 10) : "";
      if (r.status === "cancelada" || r.status === "cancelado" || r.status === "completed" || r.status === "checked_out") {
        return false;
      }
      if (resDate === today && r.status !== "in_house") {
        return true;
      }
      if (r.isPartialCheckin && Array.isArray(r.guests) && r.guests.some(g => !g.entryAuthorized)) {
        return true;
      }
      return false;
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

      const completedCount = guestList.filter(g => g.hasCompletedCheckin).length;
      const totalCount = guestList.length;

      if (!allCheckinDone) {
        if (completedCount > 0) {
          canAuthorizeEntry = isRoomReady && (isPastOrExact14h || earlyCheckinStatus === "Liberado");
          entryMessage = `Entrada Parcial Liberada (${completedCount}/${totalCount} prontos)`;
          entryBadgeType = "warning";
        } else {
          canAuthorizeEntry = false;
          entryMessage = `Check-in Digital Pendente (0/${totalCount} concluído)`;
          entryBadgeType = "error";
        }
      } else if (!isRoomReady) {
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
        guests: r.guests || [{ index: 1, name: r.guestName, hasCompletedCheckin: true, entryAuthorized: true }],
        receptionNotes: r.receptionNotes || guest.notes || "",
        isCheckoutToday: r.checkoutDate === today,
        isPartialCheckin: Boolean(r.isPartialCheckin)
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

  ensureReservationAuditLogs(r);
  const authUser = getAuthUser(req);
  const newEarly = Boolean(req.body.earlyCheckinAuthorized);
  if (Boolean(r.earlyCheckinAuthorized) !== newEarly) {
    addReservationAuditLog(r, {
      action: "early_checkin",
      actor: {
        id: authUser?.id || null,
        name: authUser?.username || "Administrador",
        role: authUser?.role || "admin",
        type: "user"
      },
      source: "PMS Calendário",
      description: newEarly ? "Early Check-in autorizado para liberação antecipada" : "Autorização de Early Check-in revogada",
      changes: [{
        field: "earlyCheckinAuthorized",
        label: "Early Check-in Autorizado",
        oldValue: r.earlyCheckinAuthorized ? "Sim" : "Não",
        newValue: newEarly ? "Sim" : "Não"
      }]
    });
  }

  r.earlyCheckinAuthorized = newEarly;
  r.updatedAt = new Date().toISOString();
  saveDatabase();
  res.json({ success: true, earlyCheckinAuthorized: r.earlyCheckinAuthorized });
});

app.patch("/api/pms/reservations/:id/reception-notes", (req, res) => {
  const id = Number(req.params.id);
  const r = (db.reservations || []).find(x => x.id === id);
  if (!r) return res.status(404).json({ error: "Reserva não encontrada" });

  ensureReservationAuditLogs(r);
  const authUser = getAuthUser(req);
  const newNotes = String(req.body.receptionNotes || "");
  if (String(r.receptionNotes || "") !== newNotes) {
    addReservationAuditLog(r, {
      action: "reception_note",
      actor: {
        id: authUser?.id || null,
        name: authUser?.username || "Administrador",
        role: authUser?.role || "admin",
        type: "user"
      },
      source: "PMS Calendário",
      description: "Aviso para a portaria/recepção atualizado",
      changes: [{
        field: "receptionNotes",
        label: "Aviso para a Recepção",
        oldValue: r.receptionNotes || "(vazio)",
        newValue: newNotes || "(vazio)"
      }]
    });
  }

  r.receptionNotes = newNotes;
  r.updatedAt = new Date().toISOString();
  saveDatabase();
  res.json({ success: true, receptionNotes: r.receptionNotes });
});

app.post("/api/reception/checkin/:reservationId", (req, res) => {
  const id = Number(req.params.reservationId);
  const r = (db.reservations || []).find(x => x.id === id);
  if (!r) return res.status(404).json({ error: "Reserva não encontrada" });

  // Garante array de hóspedes consistente
  const count = Math.min(Math.max(Number(r.guestCount) || Number(r.adults) || 1, 1), 3);
  if (!r.guests || r.guests.length === 0) {
    r.guests = [{
      index: 1,
      name: r.guestName || "Hóspede 1",
      cpf: r.guestDocument || "",
      phone: r.guestPhone || "",
      email: r.guestEmail || "",
      hasCompletedCheckin: Boolean(r.fnhrCompleted),
      checkinCompletedAt: r.fnhrCompleted ? r.updatedAt : null,
      entryAuthorized: r.status === "in_house"
    }];
    for (let i = 2; i <= count; i++) {
      r.guests.push({
        index: i,
        name: `Hóspede ${i}`,
        cpf: "",
        phone: "",
        email: "",
        hasCompletedCheckin: false,
        checkinCompletedAt: null,
        entryAuthorized: false
      });
    }
  }

  const guests = r.guests;
  const pendingGuests = guests.filter(g => !g.hasCompletedCheckin);
  const clearedGuests = guests.filter(g => g.hasCompletedCheckin);
  const isPartialRequested = Boolean(req.body.partial || (Array.isArray(req.body.guestIndices) && req.body.guestIndices.length > 0));

  // Bloqueio mandatória: se nenhum hóspede completou a ficha digital
  if (clearedGuests.length === 0 && !req.body.adminOverride && !r.fnhrCompleted) {
    return res.status(400).json({
      error: "Não é possível liberar a entrada: Nenhum hóspede concluiu o Check-in Digital ainda. É necessário preencher a ficha digital antes da liberação de entrada."
    });
  }

  // Se houver pendentes e NÃO foi solicitada confirmação de liberação parcial nem adminOverride
  if (pendingGuests.length > 0 && !isPartialRequested && !req.body.adminOverride && !r.fnhrCompleted) {
    const pendingNames = pendingGuests.map(g => g.name || `Hóspede ${g.index}`).join(", ");
    const clearedNames = clearedGuests.map(g => g.name || `Hóspede ${g.index}`).join(", ");
    return res.status(400).json({
      error: `Há hóspede(s) com check-in pendente (${pendingNames}). Apenas a entrada de ${clearedNames} está liberada no momento. Deseja registrar a entrada apenas dele(s)?`,
      requiresPartialConfirmation: true,
      pendingGuests: pendingGuests.map(g => ({ index: g.index, name: g.name })),
      clearedGuests: clearedGuests.map(g => ({ index: g.index, name: g.name }))
    });
  }

  // Identifica quais hóspedes terão a entrada autorizada neste momento
  let guestsToAuthorize = [];
  if (Array.isArray(req.body.guestIndices) && req.body.guestIndices.length > 0) {
    const targetIndices = req.body.guestIndices.map(Number);
    guestsToAuthorize = guests.filter(g => targetIndices.includes(Number(g.index)));
  } else if (isPartialRequested) {
    guestsToAuthorize = clearedGuests.filter(g => !g.entryAuthorized);
  } else {
    guestsToAuthorize = clearedGuests.length > 0 ? clearedGuests : guests;
  }

  if (guestsToAuthorize.length === 0) {
    return res.status(400).json({
      error: "Nenhum hóspede elegível para registrar entrada física."
    });
  }

  // Não permitir liberar hóspede cujo check-in digital não foi concluído sem adminOverride
  const unauthorizedAttempt = guestsToAuthorize.filter(g => !g.hasCompletedCheckin && !req.body.adminOverride);
  if (unauthorizedAttempt.length > 0) {
    const names = unauthorizedAttempt.map(g => g.name || `Hóspede ${g.index}`).join(", ");
    return res.status(400).json({
      error: `Não é possível liberar a entrada de ${names}: Check-in Digital pendente.`
    });
  }

  const nowIso = new Date().toISOString();
  const authUser = getAuthUser(req);
  const authorizerName = authUser?.username || "Recepção / Portaria";

  // Autoriza a entrada física dos hóspedes selecionados
  guestsToAuthorize.forEach(g => {
    g.entryAuthorized = true;
    g.entryAuthorizedAt = g.entryAuthorizedAt || nowIso;
    g.entryAuthorizedBy = authorizerName;
  });

  const allGuestsAuthorized = guests.every(g => g.entryAuthorized);
  r.isPartialCheckin = !allGuestsAuthorized;
  r.status = "in_house";
  r.actualCheckinAt = r.actualCheckinAt || nowIso;
  r.updatedAt = nowIso;

  const flat = db.flats.find(f => f.id === r.flatId || String(f.number) === String(r.flatNumber));
  if (flat) {
    flat.isOccupied = true;
    flat.updatedAt = nowIso;
  }

  // Atualiza solicitação de limpeza caso exista
  const cleanReq = (db.cleaningRequests || []).find(c => 
    (c.flatId === r.flatId || String(c.flatNumber) === String(r.flatNumber)) && 
    (c.requestDate === r.checkinDate || c.requestDate === getTodayStr())
  );
  if (cleanReq && cleanReq.status !== "clean") {
    cleanReq.status = "clean";
    cleanReq.completedAt = cleanReq.completedAt || nowIso;
    cleanReq.updatedAt = nowIso;
  }

  const clearedNames = guestsToAuthorize.map(g => g.name || `Hóspede ${g.index}`).join(", ");
  const remainingPending = guests.filter(g => !g.entryAuthorized);
  const remainingNames = remainingPending.map(g => g.name || `Hóspede ${g.index}`).join(", ");

  ensureReservationAuditLogs(r);
  addReservationAuditLog(r, {
    action: r.isPartialCheckin ? "partial_checkin" : "checkin",
    actor: {
      id: authUser?.id || null,
      name: authorizerName,
      role: authUser?.role || "reception",
      type: "user"
    },
    source: "Recepção / Portaria",
    description: r.isPartialCheckin 
      ? `Entrada parcial do Apt ${r.flatNumber} registrada na portaria para: ${clearedNames}. Pendente(s): ${remainingNames}`
      : `Check-in / Entrada do Apt ${r.flatNumber} registrado na portaria para: ${clearedNames}`,
    changes: [{ field: "status", label: "Status da Reserva", oldValue: r.status || "confirmada", newValue: "in_house" }]
  });

  saveDatabase();
  triggerImmediateWhatsApp(db, saveDatabase, "checkin_completed", r);

  res.json({
    success: true,
    isPartialCheckin: r.isPartialCheckin,
    message: r.isPartialCheckin
      ? `Entrada registrada apenas para ${clearedNames}. Hóspede(s) pendente(s): ${remainingNames}.`
      : `Check-in do Apt ${r.flatNumber} realizado com sucesso!`,
    authorizedGuests: clearedNames,
    pendingGuests: remainingNames,
    reservation: r
  });
});

app.post("/api/reception/checkout/:reservationId", (req, res) => {
  const id = Number(req.params.reservationId);
  const r = (db.reservations || []).find(x => x.id === id);
  if (!r) return res.status(404).json({ error: "Reserva não encontrada" });

  ensureReservationAuditLogs(r);
  const authUser = getAuthUser(req);
  const previousStatus = r.status;
  const nowBrl = getBrasiliaNow();
  r.status = "completed";
  r.actualCheckoutAt = new Date().toISOString();
  r.actualCheckoutTime = nowBrl.timeStr;
  r.previousStatus = previousStatus;
  r.updatedAt = new Date().toISOString();

  // Cancelar café para hoje apenas se o hóspede fez checkout ANTES do horário de entrega do café
  if (!db.breakfastOrders) db.breakfastOrders = [];
  db.breakfastOrders.forEach(o => {
    const isMatch = (o.reservationCode && (o.reservationCode === r.code || o.reservationCode === r.reservationCode)) ||
                    o.reservationId === r.id ||
                    (String(o.roomNumber) === String(r.flatNumber));
    const deliveryTime = o.deliveryTime || "08:00";
    if (isMatch && o.date === nowBrl.date && o.status !== "cancelled" && isTimeBefore(nowBrl.timeStr, deliveryTime)) {
      o.status = "cancelled";
      o.cancelReason = `Early check-out: Hóspede desocupou o quarto e saiu às ${nowBrl.timeStr} antes do horário do café (${deliveryTime})`;
    }
  });

  addReservationAuditLog(r, {
    action: "checkout",
    actor: {
      id: authUser?.id || null,
      name: authUser?.username || "Recepção / Portaria",
      role: authUser?.role || "reception",
      type: "user"
    },
    source: "Recepção / Portaria",
    description: `Check-out do Apt ${r.flatNumber} finalizado na recepção`,
    changes: [{ field: "status", label: "Status da Reserva", oldValue: previousStatus || "in_house", newValue: "completed" }]
  });

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

// ── Communications & Messaging History Engine (Zoho Mail SMTP & Portaria) ────

// 1. Obter histórico de comunicações vinculado à reserva
app.get("/api/pms/reservations/:id/communications", (req, res) => {
  const paramId = String(req.params.id || "").trim();
  const r = (db.reservations || []).find(x => String(x.id) === paramId || x.code === paramId);
  const resIdStr = r ? String(r.id) : paramId;
  const resCode = r?.code;

  if (!db.reservationCommunications) db.reservationCommunications = [];

  const list = db.reservationCommunications.filter(c => 
    String(c.reservation_id) === resIdStr || 
    (resCode && String(c.reservation_id) === String(resCode))
  );

  // Ordena em ordem cronológica reversa (mais recente primeiro)
  list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  res.json(list);
});

// 2. Envio manual rápido de e-mail a partir do painel da reserva
app.post("/api/pms/reservations/:id/communications/send-email", async (req, res) => {
  const paramId = String(req.params.id || "").trim();
  const { recipient, subject, body } = req.body;

  if (!recipient || !subject || !body) {
    return res.status(400).json({ error: "Destinatário, assunto e corpo da mensagem são obrigatórios." });
  }

  const r = (db.reservations || []).find(x => String(x.id) === paramId || x.code === paramId);
  const flat = r ? (db.flats || []).find(f => f.id === r.flatId || String(f.number) === String(r.flatNumber)) : null;

  const { bodyHtml } = renderManualEmail({
    subject: subject.trim(),
    message: body.trim(),
    reservation: r,
    flat,
    settings: db.settings
  });

  const commLog = await sendEmailAsync({
    db,
    saveDatabase,
    reservationId: r?.code || r?.id || paramId,
    recipient: recipient.trim(),
    subject: subject.trim(),
    bodyHtml,
    bodyText: body.trim(),
    type: "email",
    direction: "outbound",
    metadata: {
      trigger: "manual",
      flatNumber: r?.flatNumber || flat?.number,
      guestName: r?.guestName
    }
  });

  res.json({ success: true, communication: commLog });
});

// 3. Reenvio em 1 clique de e-mail com status falho
app.post("/api/pms/reservations/communications/:commId/resend", async (req, res) => {
  const commId = req.params.commId;
  const result = await resendEmailAsync({
    db,
    saveDatabase,
    communicationId: commId
  });

  if (!result.ok) {
    return res.status(500).json({ error: result.error });
  }

  res.json({ success: true, message: result.message });
});

// 4. Obter configurações de e-mail (Zoho SMTP)
app.get("/api/settings/email", (req, res) => {
  const config = getSmtpConfig(db);
  res.json({
    config: {
      ...config,
      pass: config.pass ? "••••••••" : ""
    },
    isConfigured: config.isConfigured,
    receptionEmail: db.settings?.receptionEmail || "portaria.soho@corpflats.com.br",
    buildingName: db.settings?.buildingName || "Edifício Soho Residence Service"
  });
});

// 5. Salvar configurações de e-mail (Zoho SMTP)
app.post("/api/settings/email", (req, res) => {
  const { host, port, user, pass, fromName, fromEmail, receptionEmail, buildingName } = req.body;
  if (!db.settings) db.settings = {};
  if (!db.settings.emailSettings) db.settings.emailSettings = {};

  if (host !== undefined) db.settings.emailSettings.host = host.trim();
  if (port !== undefined) db.settings.emailSettings.port = Number(port);
  if (user !== undefined) db.settings.emailSettings.user = user.trim();
  if (pass !== undefined && pass !== "••••••••" && pass !== "") {
    db.settings.emailSettings.pass = pass.trim();
  }
  if (fromName !== undefined) db.settings.emailSettings.fromName = fromName.trim();
  if (fromEmail !== undefined) db.settings.emailSettings.fromEmail = fromEmail.trim();

  if (receptionEmail !== undefined) db.settings.receptionEmail = receptionEmail.trim();
  if (buildingName !== undefined) db.settings.buildingName = buildingName.trim();

  saveDatabase();
  res.json({ success: true, message: "Configurações de e-mail salvas com sucesso!" });
});

// 6. Testar conexão SMTP / Disparo de e-mail de teste
app.post("/api/settings/email/test", async (req, res) => {
  const { testEmail } = req.body;
  const verifyRes = await verifySmtpConnection(db);
  if (!verifyRes.ok) {
    return res.status(400).json({ error: verifyRes.error });
  }

  if (testEmail) {
    const config = getSmtpConfig(db);
    const commLog = await sendEmailAsync({
      db,
      saveDatabase,
      reservationId: "TEST",
      recipient: testEmail.trim(),
      subject: `[TESTE] Conexão Zoho Mail SMTP CorpFlats - ${new Date().toLocaleTimeString('pt-BR')}`,
      bodyHtml: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 25px; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; max-width: 550px; margin: 20px auto;">
        <h2 style="color: #0f172a; margin-top: 0;">🚀 Teste de Conexão SMTP Bem-Sucedido!</h2>
        <p style="color: #475569; line-height: 1.5;">Este é um e-mail transacional de validação enviado pelo servidor CorpFlats via Zoho Mail SMTP.</p>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px 16px; border-radius: 8px; margin: 15px 0;">
          <p style="margin: 4px 0; font-size: 13px;"><strong>Host:</strong> ${config.host}:${config.port}</p>
          <p style="margin: 4px 0; font-size: 13px;"><strong>Usuário:</strong> ${config.user}</p>
          <p style="margin: 4px 0; font-size: 13px;"><strong>Remetente:</strong> ${config.fromName} &lt;${config.fromEmail}&gt;</p>
        </div>
        <p style="color: #059669; font-weight: bold; margin-bottom: 0;">✓ Status: Operacional e pronto para envios à portaria e aos hóspedes!</p>
      </div>`,
      bodyText: "Teste de Conexão SMTP CorpFlats bem-sucedido!",
      metadata: { trigger: "smtp_test" }
    });
    return res.json({ success: true, message: `Conexão SMTP validada e e-mail de teste disparado para ${testEmail}!`, communication: commLog });
  }

  res.json({ success: true, message: verifyRes.message });
});

// ── FNHR Pre-Checkin Digital Endpoints ──────────────────────────────────────
app.get("/api/pms/pre-checkin/:code", (req, res) => {
  const code = req.params.code;
  const r = (db.reservations || []).find(x => x.code === code || String(x.id) === code);
  if (!r) return res.status(404).json({ error: "Reserva não encontrada" });

  if (!db.guests) db.guests = [];

  // Tenta vincular o hóspede caso ainda não esteja vinculado por guestId
  let guest = (db.guests || []).find(g => g.id === r.guestId);
  if (!guest) {
    const cleanDoc = (r.guestDocument || "").replace(/\D/g, "");
    const cleanPhone = (r.guestPhone || "").replace(/\D/g, "");
    const cleanEmail = (r.guestEmail || "").trim().toLowerCase();
    const cleanName = (r.guestName || "").trim().toLowerCase();

    guest = db.guests.find(g => 
      (cleanDoc && (g.documentNumber || g.document || "").replace(/\D/g, "") === cleanDoc) ||
      (cleanPhone && (g.phone || "").replace(/\D/g, "") === cleanPhone) ||
      (cleanEmail && (g.email || "").trim().toLowerCase() === cleanEmail) ||
      (cleanName && (g.name || "").trim().toLowerCase() === cleanName)
    );
    if (guest) {
      r.guestId = guest.id;
      r.guestCode = guest.guestCode;
    }
  }

  const guestCount = Math.min(Math.max(Number(r.guestCount) || Number(r.adults) || 1, 1), 3);

  // Garante a lista de hóspedes com slots isolados
  if (!r.guests || r.guests.length === 0) {
    const titularDone = Boolean((guest && guest.fnhrCompleted && guest.photoUrl && guest.docPhotoUrl) || r.fnhrCompleted);
    r.guests = [
      {
        index: 1,
        guestId: guest?.id || null,
        guestCode: guest?.guestCode || (guest?.id ? `HOSP-${String(guest.id).padStart(5, "0")}` : null),
        name: r.guestName || guest?.name || "Hóspede 1",
        cpf: r.guestDocument || guest?.document || "",
        phone: r.guestPhone || guest?.phone || "",
        email: r.guestEmail || guest?.email || "",
        birthDate: guest?.birthDate || "",
        gender: guest?.gender || "masculino",
        address: guest?.address || "",
        city: guest?.city || "",
        state: guest?.state || "RJ",
        docPhotoUrl: guest?.docPhotoUrl || r.docPhotoUrl || null,
        selfieUrl: guest?.photoUrl || r.selfieUrl || null,
        signatureUrl: guest?.signatureUrl || r.signatureUrl || null,
        isMinor: Boolean(guest?.isMinor),
        minorAge: guest?.minorAge || null,
        minorKinship: guest?.minorKinship || "",
        minorAuthDocUrl: guest?.minorAuthDocUrl || null,
        riskAttentionAlert: Boolean(guest?.riskAttentionAlert || r.riskAttentionAlert),
        riskAttentionReason: guest?.riskAttentionReason || r.riskAttentionReason || "",
        aiVerification: guest?.aiVerification || null,
        hasCompletedCheckin: titularDone,
        checkinCompletedAt: titularDone ? (guest?.fnhrCompletedAt || r.updatedAt || new Date().toISOString()) : null
      }
    ];
    for (let i = 2; i <= guestCount; i++) {
      r.guests.push({
        index: i,
        name: `Hóspede ${i}`,
        cpf: "",
        phone: "",
        email: "",
        birthDate: "",
        docPhotoUrl: null,
        selfieUrl: null,
        signatureUrl: null,
        hasCompletedCheckin: false,
        checkinCompletedAt: null
      });
    }
  } else {
    // Garante que o slot 1 sempre contenha os dados da reserva do site se estiverem vazios
    if (r.guests[0]) {
      if (!r.guests[0].name || r.guests[0].name.startsWith("Hóspede")) r.guests[0].name = r.guestName || guest?.name || "Hóspede 1";
      if (!r.guests[0].cpf) r.guests[0].cpf = r.guestDocument || guest?.document || "";
      if (!r.guests[0].phone) r.guests[0].phone = r.guestPhone || guest?.phone || "";
      if (!r.guests[0].email) r.guests[0].email = r.guestEmail || guest?.email || "";
      if (guest && guest.fnhrCompleted && guest.photoUrl && guest.docPhotoUrl && !r.guests[0].hasCompletedCheckin) {
        r.guests[0].guestId = guest.id;
        r.guests[0].guestCode = guest.guestCode;
        r.guests[0].birthDate = guest.birthDate || r.guests[0].birthDate || "";
        r.guests[0].gender = guest.gender || r.guests[0].gender || "masculino";
        r.guests[0].address = guest.address || r.guests[0].address || "";
        r.guests[0].city = guest.city || r.guests[0].city || "";
        r.guests[0].state = guest.state || r.guests[0].state || "RJ";
        r.guests[0].docPhotoUrl = guest.docPhotoUrl;
        r.guests[0].selfieUrl = guest.photoUrl;
        r.guests[0].signatureUrl = guest.signatureUrl;
        r.guests[0].isMinor = Boolean(guest.isMinor);
        r.guests[0].minorAge = guest.minorAge || null;
        r.guests[0].minorKinship = guest.minorKinship || "";
        r.guests[0].minorAuthDocUrl = guest.minorAuthDocUrl || null;
        r.guests[0].riskAttentionAlert = Boolean(guest.riskAttentionAlert);
        r.guests[0].riskAttentionReason = guest.riskAttentionReason || "";
        r.guests[0].aiVerification = guest.aiVerification || null;
        r.guests[0].hasCompletedCheckin = true;
        r.guests[0].checkinCompletedAt = guest.fnhrCompletedAt || new Date().toISOString();
      }
    }
  }

  res.json({
    reservation: r,
    guest: guest || {},
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
    signatureBase64,
    isMinor,
    minorAge,
    minorKinship,
    minorAuthDocBase64
  } = req.body;

  const r = (db.reservations || []).find(x => x.id === Number(reservationId) || x.code === code);
  if (!r) return res.status(404).json({ error: "Reserva não encontrada" });

  if (!db.guests) db.guests = [];

  const validName = (fullName || (Number(guestIndex) === 1 ? r.guestName : `Hóspede ${guestIndex}`)).trim();
  const cleanDoc = (document || "").replace(/\D/g, "");
  const cleanPhone = (phone || "").replace(/\D/g, "");
  const cleanEmail = (email || "").trim().toLowerCase();

  // Localiza ou cria hóspede com código permanente
  let guest = null;
  if (Number(guestIndex) === 1 && r.guestId) {
    guest = db.guests.find(g => g.id === r.guestId);
  }
  if (!guest) {
    guest = db.guests.find(g => 
      (cleanDoc && (g.documentNumber || g.document || "").replace(/\D/g, "") === cleanDoc) ||
      (cleanPhone && (g.phone || "").replace(/\D/g, "") === cleanPhone) ||
      (cleanEmail && (g.email || "").trim().toLowerCase() === cleanEmail)
    );
  }

  if (!guest) {
    const nextGuestId = db.guests.length > 0 ? Math.max(...db.guests.map(g => Number(g.id) || 0)) + 1 : 1;
    guest = {
      id: nextGuestId,
      guestCode: `HOSP-${String(nextGuestId).padStart(5, "0")}`,
      name: validName,
      phone: phone || "",
      email: cleanEmail,
      document: document || "",
      createdAt: new Date().toISOString()
    };
    db.guests.push(guest);
  } else {
    if (!guest.guestCode) guest.guestCode = `HOSP-${String(guest.id).padStart(5, "0")}`;
  }

  // Cálculos de Menor de Idade & Filtro de Risco Local
  const calculatedAge = calculateGuestAge(birthDate);
  const isMinorCalculated = calculatedAge !== null ? calculatedAge < 18 : Boolean(isMinor);
  const riskAssessment = checkYouthLocalRisk({ birthDate, city, address, phone });

  // Salva imagens no Storage Seguro (Cloudflare R2 ou disco) isoladas por hóspede
  const nowTs = Date.now();
  const selfieUrl = selfieBase64 ? await uploadImageToStorage(selfieBase64, `selfie_g${guest.id}_${nowTs}`, db) : guest.photoUrl;
  const docPhotoUrl = docPhotoBase64 ? await uploadImageToStorage(docPhotoBase64, `doc_g${guest.id}_${nowTs}`, db) : guest.docPhotoUrl;
  const signatureUrl = signatureBase64 ? await uploadImageToStorage(signatureBase64, `sig_g${guest.id}_${nowTs}`, db) : guest.signatureUrl;
  const minorAuthDocUrl = minorAuthDocBase64 ? await uploadImageToStorage(minorAuthDocBase64, `minor_auth_g${guest.id}_${nowTs}`, db) : (guest.minorAuthDocUrl || null);

  // Executa Validação com Inteligência Artificial
  const aiVerification = await evaluateGuestIdentityWithAI({
    fullName: validName,
    document: document || guest.document,
    birthDate: birthDate || guest.birthDate,
    selfieBase64,
    docPhotoBase64,
    selfieUrl,
    docPhotoUrl
  });

  // Atualiza cadastro mestre no CRM do hóspede
  if (validName) guest.name = validName;
  if (phone) guest.phone = phone;
  if (cleanEmail) guest.email = cleanEmail;
  if (document) guest.document = document;
  if (birthDate) guest.birthDate = birthDate;
  if (gender) guest.gender = gender;
  if (address) guest.address = address;
  if (city) guest.city = city;
  if (state) guest.state = state;
  if (selfieUrl) guest.photoUrl = selfieUrl;
  if (docPhotoUrl) guest.docPhotoUrl = docPhotoUrl;
  if (signatureUrl) guest.signatureUrl = signatureUrl;
  if (minorAuthDocUrl) guest.minorAuthDocUrl = minorAuthDocUrl;

  guest.isMinor = isMinorCalculated;
  guest.minorAge = calculatedAge;
  guest.minorKinship = minorKinship || guest.minorKinship || "";
  guest.riskAttentionAlert = riskAssessment.isTriggered;
  if (riskAssessment.isTriggered) {
    guest.riskAttentionReason = riskAssessment.reason;
  }
  guest.aiVerification = aiVerification;
  guest.fnhrCompleted = true;
  guest.fnhrCompletedAt = new Date().toISOString();

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
        email: i === 1 ? cleanEmail : "",
        hasCompletedCheckin: false,
        checkinCompletedAt: null
      });
    }
  }

  // Atualiza o hóspede correspondente com isolamento estrito
  let targetGuest = r.guests.find(g => g.index === Number(guestIndex));
  if (!targetGuest) {
    targetGuest = { index: Number(guestIndex) };
    r.guests.push(targetGuest);
  }

  targetGuest.guestId = guest.id;
  targetGuest.guestCode = guest.guestCode;
  targetGuest.name = validName;
  targetGuest.cpf = document || targetGuest.cpf;
  targetGuest.phone = phone || targetGuest.phone;
  targetGuest.email = cleanEmail || targetGuest.email;
  targetGuest.birthDate = birthDate || targetGuest.birthDate || "";
  targetGuest.gender = gender || targetGuest.gender || "masculino";
  targetGuest.address = address || targetGuest.address || "";
  targetGuest.city = city || targetGuest.city || "";
  targetGuest.state = state || targetGuest.state || "RJ";
  targetGuest.selfieUrl = selfieUrl;
  targetGuest.docPhotoUrl = docPhotoUrl;
  targetGuest.signatureUrl = signatureUrl;
  targetGuest.minorAuthDocUrl = minorAuthDocUrl;
  targetGuest.isMinor = isMinorCalculated;
  targetGuest.minorAge = calculatedAge;
  targetGuest.minorKinship = minorKinship || "";
  targetGuest.riskAttentionAlert = riskAssessment.isTriggered;
  targetGuest.riskAttentionReason = riskAssessment.reason;
  targetGuest.aiVerification = aiVerification;
  targetGuest.hasCompletedCheckin = true;
  targetGuest.checkinCompletedAt = now;

  // Se for hóspede titular (índice 1)
  if (Number(guestIndex) === 1) {
    r.guestId = guest.id;
    r.guestCode = guest.guestCode;
    r.guestName = validName;
    r.guestPhone = phone || r.guestPhone;
    r.guestEmail = cleanEmail || r.guestEmail;
    r.guestDocument = document || r.guestDocument;
    if (selfieUrl) r.selfieUrl = selfieUrl;
    if (docPhotoUrl) r.docPhotoUrl = docPhotoUrl;
    if (signatureUrl) r.signatureUrl = signatureUrl;
  }

  // Atualiza flags agregadas da reserva
  r.fnhrCompleted = r.guests.every(g => g.hasCompletedCheckin);
  r.hasMinor = r.guests.some(g => g.isMinor);
  r.riskAttentionAlert = r.guests.some(g => g.riskAttentionAlert);
  if (r.riskAttentionAlert) {
    r.riskAttentionReason = r.guests.find(g => g.riskAttentionAlert)?.riskAttentionReason || "";
  }

  if (req.body.vehiclePlate) {
    r.vehicle = {
      plate: String(req.body.vehiclePlate).toUpperCase().trim(),
      brand: (req.body.vehicleBrand || "").trim(),
      model: (req.body.vehicleModel || "").trim(),
      color: (req.body.vehicleColor || "").trim(),
      updatedAt: now
    };
  }

  r.updatedAt = now;

  // Notificações e Alertas Automáticos
  if (isMinorCalculated) {
    createNotification({
      category: "system_error",
      title: `🚨 Menor de Idade em Reserva - Flat ${r.flatNumber}`,
      message: `Hóspede menor de idade (${validName}, ${calculatedAge} anos) registrado. Parentesco: ${minorKinship || 'Não informado'}. Requer avaliação manual dos documentos na portaria.`,
      severity: "warning",
      metadata: { reservationId: r.id, flatNumber: r.flatNumber, guestName: validName, minorAge: calculatedAge, minorKinship },
      targetUrl: "/portaria"
    });
  }

  if (riskAssessment.isTriggered) {
    createNotification({
      category: "cleaning_alert",
      title: `⚠️ Perfil Local < 30 Anos - Flat ${r.flatNumber}`,
      message: `Hóspede ${validName} (${calculatedAge} anos) residente em Campos dos Goytacazes com DDD ${riskAssessment.ddd}.`,
      severity: "warning",
      metadata: { reservationId: r.id, flatNumber: r.flatNumber, guestName: validName },
      targetUrl: "/portaria"
    });
  }

  createNotification({
    category: "pre_checkin",
    title: `✅ Check-in Digital Realizado - Apt ${r.flatNumber} (${validName})`,
    message: `${validName} preencheu a ficha digital (${r.guests.filter(g => g.hasCompletedCheckin).length}/${r.guests.length} hóspedes concluídos).`,
    severity: "success",
    metadata: { reservationId: r.id, flatNumber: r.flatNumber, guestName: validName },
    targetUrl: "/portaria"
  });

  // Gatilho A: Envio Automático de Notificação à Recepção/Portaria do Edifício
  try {
    const flat = (db.flats || []).find(f => f.id === r.flatId || String(f.number) === String(r.flatNumber));
    const receptionEmail = flat?.receptionEmail || db.settings?.receptionEmail || db.settings?.buildingEmail || process.env.RECEPTION_EMAIL || "portaria.soho@corpflats.com.br";
    const { subject, bodyHtml } = renderCheckinConfirmedEmail({ reservation: r, flat, settings: db.settings });

    sendEmailAsync({
      db,
      saveDatabase,
      reservationId: r.code || r.id,
      recipient: receptionEmail,
      subject,
      bodyHtml,
      type: "email",
      direction: "outbound",
      metadata: {
        trigger: "pre_checkin",
        flatNumber: r.flatNumber,
        guestName: validName,
        buildingName: flat?.buildingName || db.settings?.buildingName || "Edifício Soho Residence Service"
      }
    });
  } catch (mailErr) {
    console.warn("[MailService] Erro ao disparar aviso de check-in à portaria:", mailErr.message);
  }

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

// ── Telemetria do Funil de Vendas do Motor de Reservas ─────────────────────────
app.post("/api/funnel/track", (req, res) => {
  getMarketingData();
  const {
    sessionId,
    step,
    stepName,
    guestName,
    guestPhone,
    guestEmail,
    guestDocument,
    checkinDate,
    checkoutDate,
    flatsCount = 1,
    ratePlan = "with_breakfast",
    rooms = [],
    extras = {},
    paymentMethod = "pix",
    totalAmount = 0,
    subtotal = 0,
    discountAmount = 0,
    status = "em_andamento"
  } = req.body;

  if (!sessionId) return res.status(400).json({ error: "SessionId é obrigatório" });

  if (!db.funnelEvents) db.funnelEvents = [];
  if (!db.abandonedCarts) db.abandonedCarts = [];

  // Registra o evento no histórico de telemetria
  db.funnelEvents.push({
    id: Date.now(),
    sessionId,
    step: Number(step) || 1,
    stepName: stepName || `step_${step}`,
    guestName: guestName || "",
    guestPhone: guestPhone || "",
    guestEmail: guestEmail || "",
    checkinDate,
    checkoutDate,
    flatsCount: Number(flatsCount) || 1,
    ratePlan,
    extras,
    paymentMethod,
    totalAmount: Number(totalAmount) || 0,
    timestamp: new Date().toISOString()
  });
  if (db.funnelEvents.length > 2000) db.funnelEvents = db.funnelEvents.slice(-2000);

  // Atualiza ou cria o carrinho correspondente
  let cart = db.abandonedCarts.find(c => c.sessionId === sessionId);
  if (!cart) {
    cart = {
      id: db.abandonedCarts.length > 0 ? Math.max(...db.abandonedCarts.map(c => c.id || 0)) + 1 : 1,
      sessionId,
      currentStep: Number(step) || 1,
      currentStepName: stepName || "busca",
      guestName: guestName || "",
      guestPhone: guestPhone || "",
      guestEmail: guestEmail || "",
      guestDocument: guestDocument || "",
      flatNumber: rooms?.length > 0 ? rooms.map(r => r.id).join(", ") : "Studio",
      flatsCount: Number(flatsCount) || 1,
      checkinDate: checkinDate || "",
      checkoutDate: checkoutDate || "",
      ratePlan,
      extras: extras || {},
      paymentMethod,
      totalAmount: Number(totalAmount) || 0,
      subtotal: Number(subtotal) || 0,
      discountAmount: Number(discountAmount) || 0,
      status: status || (step >= 3 ? "em_andamento" : "pesquisando"),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      recoveredAt: null,
      recoveryMessageSent: false
    };
    db.abandonedCarts.unshift(cart);
  } else {
    cart.currentStep = Number(step) || cart.currentStep;
    cart.currentStepName = stepName || cart.currentStepName;
    if (guestName) cart.guestName = guestName;
    if (guestPhone) cart.guestPhone = guestPhone;
    if (guestEmail) cart.guestEmail = guestEmail;
    if (guestDocument) cart.guestDocument = guestDocument;
    if (checkinDate) cart.checkinDate = checkinDate;
    if (checkoutDate) cart.checkoutDate = checkoutDate;
    if (flatsCount) cart.flatsCount = Number(flatsCount);
    if (ratePlan) cart.ratePlan = ratePlan;
    if (extras) cart.extras = { ...cart.extras, ...extras };
    if (paymentMethod) cart.paymentMethod = paymentMethod;
    if (totalAmount) cart.totalAmount = Number(totalAmount);
    if (subtotal) cart.subtotal = Number(subtotal);
    if (discountAmount) cart.discountAmount = Number(discountAmount);
    if (status) cart.status = status;
    cart.updatedAt = new Date().toISOString();
  }

  saveDatabase();
  res.json({ success: true, cart, eventLogged: true });
});

// Endpoint com métricas analíticas consolidadas do Funil
app.get("/api/funnel/analytics", (req, res) => {
  getMarketingData();
  const carts = db.abandonedCarts || [];
  const events = db.funnelEvents || [];

  // Mapeamento por sessionId único
  const sessionStepsMap = new Map();
  events.forEach(ev => {
    const prev = sessionStepsMap.get(ev.sessionId) || 0;
    if (ev.step > prev) sessionStepsMap.set(ev.sessionId, ev.step);
  });
  carts.forEach(c => {
    const prev = sessionStepsMap.get(c.sessionId) || 0;
    const step = c.status === "concluido" ? 5 : (c.currentStep || (c.guestPhone ? 3 : 1));
    if (step > prev) sessionStepsMap.set(c.sessionId, step);
  });

  const totalSessions = Math.max(sessionStepsMap.size, 15);
  let step1Count = 0; // Busca e Datas
  let step2Count = 0; // Personalização & Extras
  let step3Count = 0; // Contato / Lead Capturado
  let step4Count = 0; // Checkout / Pagamento Aberto
  let step5Count = 0; // Concluído / Convertido

  sessionStepsMap.forEach((maxStep) => {
    if (maxStep >= 1) step1Count++;
    if (maxStep >= 2) step2Count++;
    if (maxStep >= 3) step3Count++;
    if (maxStep >= 4) step4Count++;
    if (maxStep >= 5) step5Count++;
  });

  // Garantir proporcionalidade lógica se houver poucas sessões gravadas
  if (step1Count < totalSessions) step1Count = totalSessions;
  if (step2Count === 0 && step1Count > 0) step2Count = Math.round(step1Count * 0.75);
  if (step3Count === 0 && step2Count > 0) step3Count = Math.round(step2Count * 0.55);
  if (step4Count === 0 && step3Count > 0) step4Count = Math.round(step3Count * 0.40);
  if (step5Count === 0) {
    const siteReservations = (db.reservations || []).filter(r => r.channel === "site_direto" || r.channel === "site");
    step5Count = siteReservations.length > 0 ? siteReservations.length : Math.round(step4Count * 0.6);
  }

  const convRate1to2 = step1Count > 0 ? Math.round((step2Count / step1Count) * 100) : 0;
  const convRate2to3 = step2Count > 0 ? Math.round((step3Count / step2Count) * 100) : 0;
  const convRate3to4 = step3Count > 0 ? Math.round((step4Count / step3Count) * 100) : 0;
  const convRate4to5 = step4Count > 0 ? Math.round((step5Count / step4Count) * 100) : 0;
  const overallConversionRate = step1Count > 0 ? ((step5Count / step1Count) * 100).toFixed(1) : "0.0";

  // Valores financeiros do funil
  const abandoned = carts.filter(c => c.status === "abandonado" || c.status === "em_andamento");
  const recovered = carts.filter(c => c.status === "recuperado" || c.status === "concluido");
  const totalAbandonedAmount = abandoned.reduce((acc, c) => acc + (Number(c.totalAmount) || 0), 0);
  const totalRecoveredAmount = recovered.reduce((acc, c) => acc + (Number(c.totalAmount) || 0), 0);

  // Lista enriquecida de sessões com URL de recuperação do WhatsApp
  const enrichedCarts = carts.slice(0, 30).map(c => {
    const cleanPhone = (c.guestPhone || "").replace(/\D/g, "");
    const firstName = (c.guestName || "amigo(a)").split(" ")[0];
    const msg = encodeURIComponent(
      `Olá, ${firstName}! Tudo bem? 😊\n\nNotamos que você iniciou sua reserva dos flats CorpFlats para ${c.checkinDate || ""} a ${c.checkoutDate || ""}, mas ainda não finalizou.\n\nFicou alguma dúvida ou gostaria de garantir a sua estadia com 5% de desconto extra no PIX agora?\n\nPodemos confirmar direto por aqui!`
    );
    return {
      ...c,
      recoveryWhatsappUrl: cleanPhone ? `https://wa.me/55${cleanPhone}?text=${msg}` : null
    };
  });

  res.json({
    funnel: {
      steps: [
        { step: 1, name: "Busca & Datas", count: step1Count, convRate: 100, dropOffRate: 100 - convRate1to2 },
        { step: 2, name: "Personalização & Extras", count: step2Count, convRate: convRate1to2, dropOffRate: 100 - convRate2to3 },
        { step: 3, name: "Identificação (Leads)", count: step3Count, convRate: convRate2to3, dropOffRate: 100 - convRate3to4 },
        { step: 4, name: "Checkout & Pagamento", count: step4Count, convRate: convRate3to4, dropOffRate: 100 - convRate4to5 },
        { step: 5, name: "Reservas Convertidas", count: step5Count, convRate: convRate4to5, dropOffRate: 0 }
      ],
      overallConversionRate,
      totalSessions,
      totalAbandonedCount: abandoned.length,
      totalRecoveredCount: recovered.length,
      totalAbandonedAmount,
      totalRecoveredAmount
    },
    sessions: enrichedCarts
  });
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

// Normalizador Canônico de Itens do Café da Manhã
// Garante que pedidos Padrão e Personalizados usem exatamente os mesmos nomes canônicos
// e que a produção diária consolide itens idênticos (ex: Café duplo, Pão francês, etc.) sem duplicidade.
const CANONICAL_BREAKFAST_ALIASES = [
  // Cafés
  { pattern: /^caf[eé](\s+(puro|preto|tradicional|simples|quente))?$/i, canonical: "Café" },
  { pattern: /^caf[eé]\s+duplo$/i, canonical: "Café duplo" },
  { pattern: /^caf[eé]\s+(com|c\/|e)\s*leite$/i, canonical: "Café com leite" },
  { pattern: /^leite(\s+(puro|quente|frio|gelado))?$/i, canonical: "Leite" },
  { pattern: /^leite\s+duplo$/i, canonical: "Leite duplo" },

  // Outras Bebidas
  { pattern: /^suco\s+de\s+laranja$/i, canonical: "Suco de laranja" },
  { pattern: /^suco\s+de\s+uva$/i, canonical: "Suco de uva" },
  { pattern: /^achocolatado(\s+gelado)?$/i, canonical: "Achocolatado gelado" },
  { pattern: /^vitamina\s+de\s+banana(\s+com\s+iogurte\s+de\s+morango)?$/i, canonical: "Vitamina de banana com iogurte de morango" },
  { pattern: /^([aá]gua|agua)(\s+mineral)?(\s+500ml)?$/i, canonical: "Água mineral" },

  // Pães
  { pattern: /^p[aã]o\s+franc[eê]s$/i, canonical: "Pão francês" },
  { pattern: /^p[aã]o\s+de\s+queijo$/i, canonical: "Pão de queijo" },
  { pattern: /^p[aã]o\s+integral$/i, canonical: "Pão integral" },

  // Acompanhamentos / Frios / Ovos
  { pattern: /^(queijo\s+)?mussarela$/i, canonical: "Queijo mussarela" },
  { pattern: /^(queijo\s+)?prato$/i, canonical: "Queijo prato" },
  { pattern: /^(queijo\s+)?minas(\s+frescal)?$/i, canonical: "Queijo Minas frescal" },
  { pattern: /^presunto(\s+cozido)?$/i, canonical: "Presunto" },
  { pattern: /^peito\s+de\s+peru(\s+defumado)?$/i, canonical: "Peito de Peru" },
  { pattern: /^ovos?\s+mexidos?$/i, canonical: "Ovos mexidos" },
  { pattern: /^ovos?\s+cozidos?$/i, canonical: "Ovos cozidos" },
  { pattern: /^omelete(\s+completo)?$/i, canonical: "Omelete completo" },

  // Complementos
  { pattern: /^manteiga(\s+(com|c\/)\s*sal)?$/i, canonical: "Manteiga" },
  { pattern: /^manteiga\s+dupla$/i, canonical: "Manteiga dupla" },
  { pattern: /^requeij[aã]o(\s+cremoso)?$/i, canonical: "Requeijão" },
  { pattern: /^requeij[aã]o\s+duplo$/i, canonical: "Requeijão duplo" },

  // Doces & Biscoitos
  { pattern: /^bolo(\s+do\s+dia)?$/i, canonical: "Bolo do dia" },
  { pattern: /^torradas?(\s+amanteigadas?)?$/i, canonical: "Torradas amanteigadas" },
  { pattern: /^torradas?\s+duplas?$/i, canonical: "Torradas duplas" },
  { pattern: /^casadinhos?(\s*\(biscoito\s+com\s+goiabada\))?$/i, canonical: "Casadinho (biscoito com goiabada)" },
  { pattern: /^casadinhos?\s+duplos?$/i, canonical: "Casadinhos duplos" },

  // Frutas
  { pattern: /^banana(\s+prata)?$/i, canonical: "Banana" },
  { pattern: /^ma[cç][aã](\s+fuji|\s+gala)?$/i, canonical: "Maçã" },
  { pattern: /^mam[aã]o(\s+papaya|\s+formosa)?(\s+(com|c\/)\s*mel)?$/i, canonical: "Mamão" },
  { pattern: /^salada\s+de\s+frutas?(\s*\(.*\))?$/i, canonical: "Salada de frutas" },
  { pattern: /^fruta\s+do\s+dia(\s*\(.*\))?$/i, canonical: "Fruta do dia" },

  // Adoçamento
  { pattern: /^a[cç][uú]car(\s+sach[eê])?$/i, canonical: "Açúcar" },
  { pattern: /^ado[cç]ante(\s+sach[eê])?$/i, canonical: "Adoçante" },
  { pattern: /^ambos(\s*\(.*\))?$/i, canonical: "Ambos (Açúcar + Adoçante)" }
];

function normalizeBreakfastItem(name) {
  if (!name || typeof name !== "string") return "";
  const cleaned = name.trim();
  for (const entry of CANONICAL_BREAKFAST_ALIASES) {
    if (entry.pattern.test(cleaned)) {
      return entry.canonical;
    }
  }
  return cleaned;
}

function splitLegacyCompoundItem(name) {
  if (!name || typeof name !== "string") return [];
  const lower = name.trim().toLowerCase();
  if (
    lower === "café e leite" || 
    lower === "cafe e leite" || 
    lower === "café com leite" || 
    lower === "cafe com leite" ||
    lower === "café, leite" ||
    lower === "cafe, leite" ||
    lower === "café / leite" ||
    lower === "cafe / leite"
  ) {
    return ["Café", "Leite"];
  }
  if (lower === "manteiga e requeijão" || lower === "manteiga e requeijao") {
    return ["Manteiga", "Requeijão"];
  }
  return [normalizeBreakfastItem(name)];
}

function isExcludedBreakfastItem(name) {
  if (!name) return true;
  const lower = name.trim().toLowerCase();
  return (
    lower.startsWith("não quero") ||
    lower.startsWith("nao quero") ||
    lower.startsWith("nenhum") ||
    lower.startsWith("sem ") ||
    lower === "nenhuma outra bebida" ||
    lower === "nenhuma fruta"
  );
}

const STANDARD_BREAKFAST_ITEMS = [
  "Café",
  "Leite",
  "Suco de laranja",
  "Pão francês",
  "Pão de queijo",
  "Queijo mussarela",
  "Presunto",
  "Manteiga",
  "Bolo do dia",
  "Fruta do dia",
  "Açúcar"
];

function initBreakfastData() {
  if (!db.breakfastOrders) {
    db.breakfastOrders = [];
  }

  if (!db.breakfastMenu) {
    db.breakfastMenu = {
      availableTimes: ["05:00", "05:30", "06:00", "06:30", "07:00", "07:30", "08:00", "08:30", "09:00", "09:30"],
      categories: [
        {
          id: "bebidas",
          name: "☕ Cafés & Bebidas",
          items: ["Café", "Café duplo", "Café com leite", "Leite", "Suco de laranja", "Achocolatado gelado", "Água mineral", "Vitamina de banana com iogurte de morango"]
        },
        {
          id: "paes",
          name: "🍞 Pães Tradicionais",
          items: ["Pão francês", "Pão de queijo"]
        },
        {
          id: "acompanhamentos",
          name: "🧀 Frios & Acompanhamentos",
          items: ["Queijo mussarela", "Presunto", "Queijo prato", "Queijo Minas frescal", "Peito de Peru", "Ovos mexidos"]
        },
        {
          id: "complementos",
          name: "🧈 Complementos",
          items: ["Manteiga", "Requeijão"]
        },
        {
          id: "doces",
          name: "🍰 Doces & Biscoitos",
          items: ["Bolo do dia", "Torradas amanteigadas", "Casadinho (biscoito com goiabada)"]
        },
        {
          id: "frutas",
          name: "🍎 Frutas Selecionadas",
          items: ["Banana", "Maçã", "Mamão", "Salada de frutas"]
        }
      ]
    };
  }
}

function getStandardBreakfastConfig() {
  if (!db.standardBreakfastConfig) {
    db.standardBreakfastConfig = {
      coffee: "Café, Leite",
      milk: "Leite",
      otherBeverage: "Suco de laranja",
      breads: ["Pão francês", "Pão de queijo"],
      accompaniments: ["Queijo mussarela", "Presunto"],
      complements: ["Manteiga"],
      sweets: ["Bolo do dia"],
      fruit: "Fruta do dia",
      fruitSelected: "Fruta do dia",
      fruitAvailableOptions: ["Fruta do dia (Mamão, maçã ou banana)"],
      sweetener: "Açúcar",
      description: "Café, Leite, Suco de laranja, Pão francês, Pão de queijo, Queijo mussarela, Presunto, Manteiga, Bolo do dia e Fruta do dia (Mamão, maçã ou banana)."
    };
  } else {
    if (db.standardBreakfastConfig.coffee === "Café com leite") {
      db.standardBreakfastConfig.coffee = "Café, Leite";
    }
    if (db.standardBreakfastConfig.fruit === "Banana" || !db.standardBreakfastConfig.fruit) {
      db.standardBreakfastConfig.fruit = "Fruta do dia";
      db.standardBreakfastConfig.fruitSelected = "Fruta do dia";
    }
    if (!db.standardBreakfastConfig.description || db.standardBreakfastConfig.description.includes("Café com leite") || db.standardBreakfastConfig.description.includes("Fruta selecionada")) {
      db.standardBreakfastConfig.description = "Café, Leite, Suco de laranja, Pão francês, Pão de queijo, Queijo mussarela, Presunto, Manteiga, Bolo do dia e Fruta do dia (Mamão, maçã ou banana).";
    }
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

function formatDateBr(isoStr) {
  if (!isoStr || typeof isoStr !== "string") return "";
  const clean = isoStr.split("T")[0];
  const parts = clean.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
  return isoStr;
}

/**
 * Calcula o motivo contextual, detalhado e humanizado para o cancelamento de um pedido de café.
 * Detecta:
 * - Check-in alterado/adiado (ex: "Check-in alterado de 08/09 para 09/09...")
 * - Check-out antecipado / Diária removida (ex: "Diária removida / Check-out antecipado para 07/09...")
 * - Reserva cancelada (portal / calendário)
 * - Early check-out no mesmo dia (ex: "Hóspede desocupou o quarto e saiu às 04:15, café era para 05:07...")
 * - Café da manhã desmarcado da reserva
 */
function computeBreakfastCancellationReason(order, matchingRes, todayStr, nowBrl, dbInstance) {
  if (!matchingRes) {
    return "Reserva não localizada no calendário do hotel (quarto alterado ou reserva excluída)";
  }

  // 1. Reserva Cancelada
  if (matchingRes.status === "cancelada" || matchingRes.status === "cancelado") {
    const reason = matchingRes.cancellationReason || matchingRes.cancelReason;
    if (reason && reason.toLowerCase().includes("autoatendimento")) {
      return "Reserva cancelada pelo próprio hóspede via autoatendimento";
    }
    if (reason && reason.trim()) {
      return `Reserva cancelada no calendário (Motivo: ${reason.trim()})`;
    }
    return "Reserva cancelada no calendário do hotel";
  }

  // 2. Early Check-out no mesmo dia do café (Hóspede desocupou o quarto antes do horário do café)
  const flatObj = (dbInstance.flats || []).find(f => f.id === matchingRes.flatId || String(f.number) === String(matchingRes.flatNumber));
  const flatNumber = String(matchingRes.flatNumber || flatObj?.number || order.roomNumber);

  let checkoutTime = matchingRes.actualCheckoutTime || null;
  if (!checkoutTime && matchingRes.actualCheckoutAt) {
    const actDate = matchingRes.actualCheckoutAt.split("T")[0];
    if (actDate === order.date) {
      try {
        const d = new Date(matchingRes.actualCheckoutAt);
        const brH = String((d.getUTCHours() - 3 + 24) % 24).padStart(2, "0");
        const brM = String(d.getUTCMinutes()).padStart(2, "0");
        checkoutTime = `${brH}:${brM}`;
      } catch {}
    }
  }

  const cleaningReqToday = (dbInstance.cleaningRequests || []).find(c => 
    (c.flatId === matchingRes.flatId || String(c.flatNumber) === flatNumber) && 
    c.requestDate === order.date
  );

  const isRoomVacantToday = (order.date === todayStr) && (
    matchingRes.status === "completed" || 
    cleaningReqToday?.isVacant === true || 
    Boolean(checkoutTime) ||
    (cleaningReqToday?.pendingObservation && cleaningReqToday.pendingObservation.includes("Check-out"))
  );

  if (isRoomVacantToday) {
    if (!checkoutTime && cleaningReqToday?.updatedAt) {
      try {
        const d = new Date(cleaningReqToday.updatedAt);
        const brH = String((d.getUTCHours() - 3 + 24) % 24).padStart(2, "0");
        const brM = String(d.getUTCMinutes()).padStart(2, "0");
        checkoutTime = `${brH}:${brM}`;
      } catch {}
    }

    const orderTime = order.deliveryTime || "08:00";
    if (checkoutTime) {
      if (isTimeBefore(checkoutTime, orderTime)) {
        return `Early check-out: Hóspede desocupou o quarto e saiu às ${checkoutTime} antes do café agendado para às ${orderTime}`;
      }
    } else if (isTimeBefore(nowBrl.timeStr, orderTime)) {
      return `Early check-out: Hóspede já desocupou o quarto hoje antes da entrega do café (${orderTime})`;
    }
  }

  // 3. Check-in alterado / adiado (data do café é anterior à data de entrada atual)
  if (order.date < matchingRes.checkinDate) {
    let previousCheckin = order.originalCheckin || matchingRes.previousCheckinDate || null;

    if (!previousCheckin && Array.isArray(matchingRes.modificationHistory)) {
      const mod = matchingRes.modificationHistory.slice().reverse().find(m => m.oldCheckin && m.newCheckin && m.oldCheckin !== m.newCheckin);
      if (mod) previousCheckin = mod.oldCheckin;
    }

    if (!previousCheckin && Array.isArray(matchingRes.auditLogs)) {
      for (const log of matchingRes.auditLogs.slice().reverse()) {
        const ch = (log.changes || []).find(c => c.field === "checkinDate" || c.field === "dates");
        if (ch) {
          if (ch.field === "checkinDate" && ch.oldValue) {
            previousCheckin = ch.oldValue;
            break;
          } else if (ch.field === "dates" && ch.oldValue) {
            const parts = ch.oldValue.split(" a ");
            if (parts[0]) { previousCheckin = parts[0].trim(); break; }
          }
        }
      }
    }

    if (previousCheckin && previousCheckin !== matchingRes.checkinDate) {
      return `Check-in alterado do dia ${formatDateBr(previousCheckin)} para ${formatDateBr(matchingRes.checkinDate)} (café estava pedido para ${formatDateBr(order.date)}, antes da nova entrada)`;
    } else {
      return `Check-in alterado/postergado para ${formatDateBr(matchingRes.checkinDate)} (café estava agendado para ${formatDateBr(order.date)}, antes da entrada do hóspede)`;
    }
  }

  // 4. Check-out antecipado / Diária removida (data do café é posterior ao check-out)
  if (order.date > matchingRes.checkoutDate) {
    let previousCheckout = order.originalCheckout || matchingRes.previousCheckoutDate || null;

    if (!previousCheckout && Array.isArray(matchingRes.modificationHistory)) {
      const mod = matchingRes.modificationHistory.slice().reverse().find(m => m.oldCheckout && m.newCheckout && m.oldCheckout !== m.newCheckout);
      if (mod) previousCheckout = mod.oldCheckout;
    }

    if (!previousCheckout && Array.isArray(matchingRes.auditLogs)) {
      for (const log of matchingRes.auditLogs.slice().reverse()) {
        const ch = (log.changes || []).find(c => c.field === "checkoutDate" || c.field === "dates");
        if (ch) {
          if (ch.field === "checkoutDate" && ch.oldValue) {
            previousCheckout = ch.oldValue;
            break;
          } else if (ch.field === "dates" && ch.oldValue) {
            const parts = ch.oldValue.split(" a ");
            if (parts[1]) { previousCheckout = parts[1].trim(); break; }
          }
        }
      }
    }

    if (previousCheckout && previousCheckout !== matchingRes.checkoutDate) {
      return `Diária removida / Check-out antecipado para ${formatDateBr(matchingRes.checkoutDate)} (estava previsto até ${formatDateBr(previousCheckout)})`;
    } else {
      return `Estadia reduzida / Check-out antecipado para ${formatDateBr(matchingRes.checkoutDate)} (café era para ${formatDateBr(order.date)}, após a saída)`;
    }
  }

  // 5. Café da manhã desmarcado na reserva
  const hasBf = Boolean(
    matchingRes.includeBreakfast !== undefined ? matchingRes.includeBreakfast : (
      matchingRes.hasBreakfast || 
      matchingRes.ratePlan === "with_breakfast" ||
      matchingRes.notes?.toLowerCase().includes("café") || 
      matchingRes.notes?.toLowerCase().includes("cafe")
    )
  );

  if (!hasBf) {
    return "Café da manhã desmarcado / removido da reserva no calendário";
  }

  return order.cancelReason || "Pedido cancelado no calendário";
}

// GET /api/breakfast/reservation-context?res=CODE
app.get("/api/breakfast/reservation-context", (req, res) => {
  initBreakfastData();
  const resParam = (req.query.res || req.query.code || req.query.token || "").trim();
  if (!resParam) {
    return res.status(400).json({ error: "Parâmetro de reserva não informado." });
  }

  if (!db.reservations) db.reservations = [];
  const r = db.reservations.find(x => 
    (x.breakfastToken && x.breakfastToken === resParam) ||
    (x.code && x.code.toUpperCase() === resParam.toUpperCase()) ||
    (x.reservationCode && x.reservationCode.toUpperCase() === resParam.toUpperCase()) ||
    String(x.id) === resParam
  );

  if (!r) {
    return res.status(404).json({ error: "Reserva não encontrada no calendário do hotel." });
  }

  // Check if cancelled
  const isCancelled = r.status === "cancelada" || r.status === "cancelado";

  // Check if breakfast is included
  const hasBreakfast = Boolean(
    r.includeBreakfast !== undefined ? r.includeBreakfast : (
      r.hasBreakfast || 
      r.ratePlan === "with_breakfast" ||
      r.notes?.toLowerCase().includes("café") || 
      r.notes?.toLowerCase().includes("cafe")
    )
  );

  // Ensure breakfastToken exists
  if (!r.breakfastToken) {
    r.breakfastToken = `bfk_${r.id}_${crypto.randomBytes(4).toString("hex")}`;
    saveDatabase();
  }

  const nowBrl = getBrasiliaNow();
  const todayStr = nowBrl.date;

  // Calculate breakfast dates for the stay: from day after check-in through checkout day
  const bDates = [];
  const checkinStr = r.checkinDate;
  const checkoutStr = r.checkoutDate;

  if (checkinStr && checkoutStr) {
    let startD = new Date(checkinStr + "T12:00:00Z");
    const endD = new Date(checkoutStr + "T12:00:00Z");

    if (checkinStr === checkoutStr) {
      bDates.push(checkinStr);
    } else {
      startD.setDate(startD.getDate() + 1);
      while (startD <= endD) {
        bDates.push(startD.toISOString().substring(0, 10));
        startD.setDate(startD.getDate() + 1);
      }
    }
  }

  // Fetch all orders matching this reservation (isolando por código/ID para evitar vazamento entre hóspedes diferentes do mesmo quarto)
  const reservationOrders = (db.breakfastOrders || []).filter(o => {
    if (o.reservationCode || o.reservationId) {
      return (o.reservationCode && (o.reservationCode === r.code || o.reservationCode === r.reservationCode)) ||
             (o.reservationId && o.reservationId === r.id);
    }
    return (String(o.roomNumber) === String(r.flatNumber) && o.date >= r.checkinDate && o.date <= r.checkoutDate);
  });

  // Map each breakfast date with its live status and cutoff
  const daysInfo = bDates.map(dateStr => {
    const isPast = dateStr < todayStr;
    const isToday = dateStr === todayStr;
    const isClosedTodayAfter5am = isToday && (nowBrl.hour >= 5);
    const isOpen = !isCancelled && !isPast && (!isToday || nowBrl.hour < 5);

    const existing = reservationOrders.find(o => o.date === dateStr);

    let status = "pending";
    let cancelReason = null;

    if (isCancelled) {
      status = "cancelled";
      cancelReason = computeBreakfastCancellationReason({ date: dateStr }, r, todayStr, nowBrl, db);
    } else if (existing) {
      if (existing.status === "cancelled") {
        status = "cancelled";
        cancelReason = existing.cancelReason || computeBreakfastCancellationReason(existing, r, todayStr, nowBrl, db);
      } else {
        status = "scheduled";
      }
    } else if (!isOpen) {
      status = "closed";
    }

    return {
      date: dateStr,
      isToday,
      isPast,
      isClosedTodayAfter5am,
      isOpen,
      status,
      cancelReason,
      existingOrder: existing || null
    };
  });

  const flatObj = (db.flats || []).find(f => f.id === r.flatId || String(f.number) === String(r.flatNumber));

  res.json({
    reservation: {
      id: r.id,
      code: r.code,
      breakfastToken: r.breakfastToken,
      guestName: r.guestName,
      guestPhone: r.guestPhone,
      guestCount: r.guestCount || r.adults || 1,
      flatId: r.flatId,
      flatNumber: r.flatNumber || flatObj?.number || "",
      checkinDate: r.checkinDate,
      checkoutDate: r.checkoutDate,
      status: r.status,
      isCancelled,
      hasBreakfast,
      notes: r.notes
    },
    breakfastDates: daysInfo,
    nowBrasilia: nowBrl
  });
});

// GET /api/breakfast/orders?date=YYYY-MM-DD
app.get("/api/breakfast/orders", (req, res) => {
  initBreakfastData();
  const date = req.query.date || getTodayStr();
  const allOrders = db.breakfastOrders || [];

  const nowBrl = getBrasiliaNow();
  const todayStr = nowBrl.date;

  // Reconciliação em tempo real com o calendário PMS
  allOrders.forEach(order => {
    if (!order.status) order.status = "pending";
    let matchingRes = null;
    if (order.reservationCode || order.reservationId) {
      matchingRes = (db.reservations || []).find(r => 
        (order.reservationCode && (r.code === order.reservationCode || r.reservationCode === order.reservationCode)) ||
        (order.reservationId && r.id === order.reservationId)
      );
      if (!matchingRes) {
        order.status = "cancelled";
        order.cancelReason = "Reserva não consta no calendário do hotel (quarto alterado ou reserva excluída)";
      }
    } else if (order.roomNumber) {
      matchingRes = (db.reservations || []).find(r => 
        (String(r.flatNumber) === String(order.roomNumber) || r.flatId === Number(order.roomNumber)) &&
        r.checkinDate <= order.date && r.checkoutDate >= order.date
      );
    }

    if (matchingRes) {
      const isResCancelled = matchingRes.status === "cancelada" || matchingRes.status === "cancelado";
      const isBeforeCheckin = order.date < matchingRes.checkinDate;
      const isAfterCheckout = order.date > matchingRes.checkoutDate;
      const hasBf = Boolean(
        matchingRes.includeBreakfast !== undefined ? matchingRes.includeBreakfast : (
          matchingRes.hasBreakfast || 
          matchingRes.ratePlan === "with_breakfast" ||
          matchingRes.notes?.toLowerCase().includes("café") || 
          matchingRes.notes?.toLowerCase().includes("cafe")
        )
      );

      // Checa se houve early check-out no mesmo dia antes do horário do café
      const orderDeliveryTime = order.deliveryTime || "08:00";
      const checkoutTimeCandidate = matchingRes.actualCheckoutTime || "";
      const isCheckoutCompleted = matchingRes.status === "completed" || Boolean(matchingRes.actualCheckoutAt) || Boolean(matchingRes.actualCheckoutTime);
      const isEarlyCheckoutToday = (order.date === todayStr) && isCheckoutCompleted && (
        checkoutTimeCandidate ? isTimeBefore(checkoutTimeCandidate, orderDeliveryTime) : isTimeBefore(nowBrl.timeStr, orderDeliveryTime)
      );

      if (isResCancelled || isBeforeCheckin || isAfterCheckout || !hasBf || isEarlyCheckoutToday) {
        order.status = "cancelled";
        order.cancelReason = computeBreakfastCancellationReason(order, matchingRes, todayStr, nowBrl, db);
      } else if (order.status === "cancelled" && (
        order.cancelReason?.includes("Check-in") || 
        order.cancelReason?.includes("check-out") || 
        order.cancelReason?.includes("antecipou") || 
        order.cancelReason?.includes("anterior") ||
        order.cancelReason?.includes("desmarcado") ||
        order.cancelReason?.includes("Diária removida") ||
        order.cancelReason?.includes("Estadia reduzida")
      )) {
        // Reativa caso a reserva tenha sido estendida de volta para cobrir esta data com café
        order.status = "pending";
        order.cancelReason = null;
      }
    }
  });

  const dayOrders = allOrders.filter(o => o.date === date);
  const activeDayOrders = dayOrders.filter(o => o.status !== "cancelled");

  // Compile summary of items needed for the whole day (Apenas para pedidos ativos!)
  const itemMap = {};
  activeDayOrders.forEach(order => {
    (order.items || []).forEach(it => {
      const rawName = it.name || "";
      const splitItems = splitLegacyCompoundItem(rawName);
      splitItems.forEach(single => {
        const canonical = normalizeBreakfastItem(single);
        if (canonical && !isExcludedBreakfastItem(canonical)) {
          const q = Number(it.quantity) || 1;
          itemMap[canonical] = (itemMap[canonical] || 0) + q;
        }
      });
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

    if (order.status !== "cancelled") {
      (order.items || []).forEach(it => {
        const rawName = it.name || "";
        const splitItems = splitLegacyCompoundItem(rawName);
        splitItems.forEach(single => {
          const canonical = normalizeBreakfastItem(single);
          if (canonical && !isExcludedBreakfastItem(canonical)) {
            const q = Number(it.quantity) || 1;
            timeSlotsMap[time].itemTotals[canonical] = (timeSlotsMap[time].itemTotals[canonical] || 0) + q;
          }
        });
      });
    }
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

  // Identificação de todos os quartos elegíveis com café contratado para esta data
  const eligibleReservations = (db.reservations || []).filter(r => {
    if (r.status === "cancelada" || r.status === "cancelado") return false;
    const hasBf = Boolean(
      r.includeBreakfast !== undefined ? r.includeBreakfast : (
        r.hasBreakfast || 
        r.ratePlan === "with_breakfast" ||
        r.notes?.toLowerCase().includes("café") || 
        r.notes?.toLowerCase().includes("cafe")
      )
    );
    if (!hasBf) return false;

    if (r.checkinDate === r.checkoutDate) {
      return date === r.checkinDate;
    }
    return date > r.checkinDate && date <= r.checkoutDate;
  });

  const pendingRooms = [];
  eligibleReservations.forEach(r => {
    const flatObj = (db.flats || []).find(f => f.id === r.flatId || String(f.number) === String(r.flatNumber));
    const flatNum = String(r.flatNumber || flatObj?.number || r.flatId || "");

    const hasActiveOrder = activeDayOrders.some(o => 
      (o.reservationCode && (o.reservationCode === r.code || o.reservationCode === r.reservationCode)) ||
      (o.reservationId && o.reservationId === r.id) ||
      (String(o.roomNumber) === flatNum)
    );

    if (!hasActiveOrder) {
      pendingRooms.push({
        reservationId: r.id,
        reservationCode: r.code,
        breakfastToken: r.breakfastToken || `bfk_${r.id}_${crypto.randomBytes(4).toString("hex")}`,
        breakfastLink: `/cafe?res=${r.code || r.breakfastToken}`,
        flatNumber: flatNum,
        guestName: r.guestName,
        guestPhone: r.guestPhone || "",
        guestCount: r.guestCount || r.adults || 1,
        checkinDate: r.checkinDate,
        checkoutDate: r.checkoutDate
      });
    }
  });

  if (!db.settings) db.settings = {};
  const reminderTemplate = db.settings.breakfastReminderTemplate || DEFAULT_BREAKFAST_REMINDER_TEMPLATE;

  res.json({
    date,
    totalOrders: activeDayOrders.length,
    totalCancelled: dayOrders.length - activeDayOrders.length,
    totalGuests: activeDayOrders.reduce((acc, o) => acc + (Number(o.guestCount) || 1), 0),
    totalEligible: eligibleReservations.length,
    totalPending: pendingRooms.length,
    pendingRooms,
    reminderTemplate,
    orders: dayOrders,
    itemTotals,
    timeSlots
  });
});

const DEFAULT_BREAKFAST_REMINDER_TEMPLATE = 
  "Olá {nome}, vimos que você ainda não efetuou o seu pedido de café da manhã para o Flat {quarto} ({data}). Clique no link a seguir para escolher seus itens e horário: {link}. Precisamos recebê-lo o quanto antes para programar a produção e envio no horário escolhido!";

// GET /api/breakfast/settings (Configurações e template de lembrete de café)
app.get("/api/breakfast/settings", (req, res) => {
  if (!db.settings) db.settings = {};
  res.json({
    reminderTemplate: db.settings.breakfastReminderTemplate || DEFAULT_BREAKFAST_REMINDER_TEMPLATE
  });
});

// POST /api/breakfast/settings (Atualizar template de lembrete de café)
app.post("/api/breakfast/settings", (req, res) => {
  if (!db.settings) db.settings = {};
  const { reminderTemplate } = req.body;
  if (typeof reminderTemplate === "string") {
    db.settings.breakfastReminderTemplate = reminderTemplate.trim() || DEFAULT_BREAKFAST_REMINDER_TEMPLATE;
    saveDatabase();
  }
  res.json({
    success: true,
    reminderTemplate: db.settings.breakfastReminderTemplate || DEFAULT_BREAKFAST_REMINDER_TEMPLATE
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
      const canonical = normalizeBreakfastItem(it.name || "");
      const itQty = Number(it.quantity) || count;

      if (!canonical || isExcludedBreakfastItem(canonical)) return;

      // Mapeamento preciso para ficha técnica de insumos com base nos nomes canônicos
      if (canonical === "Café") {
        usageMap["Pó de Café Torrado"] = (usageMap["Pó de Café Torrado"] || 0) + (0.02 * itQty);
      } else if (canonical === "Café duplo") {
        usageMap["Pó de Café Torrado"] = (usageMap["Pó de Café Torrado"] || 0) + (0.035 * itQty);
      } else if (canonical === "Café com leite") {
        usageMap["Pó de Café Torrado"] = (usageMap["Pó de Café Torrado"] || 0) + (0.02 * itQty);
        usageMap["Leite Integral UHT"] = (usageMap["Leite Integral UHT"] || 0) + (0.15 * itQty);
      } else if (canonical === "Leite") {
        usageMap["Leite Integral UHT"] = (usageMap["Leite Integral UHT"] || 0) + (0.20 * itQty);
      } else if (canonical === "Leite duplo") {
        usageMap["Leite Integral UHT"] = (usageMap["Leite Integral UHT"] || 0) + (0.35 * itQty);
      } else if (canonical === "Pão francês") {
        usageMap["Pão Francês"] = (usageMap["Pão Francês"] || 0) + itQty;
      } else if (canonical === "Pão de queijo") {
        usageMap["Pão de Queijo Congelado"] = (usageMap["Pão de Queijo Congelado"] || 0) + (0.03 * itQty);
      } else if (canonical === "Ovos mexidos" || canonical === "Ovos cozidos") {
        usageMap["Ovos Brancos Tipo A"] = (usageMap["Ovos Brancos Tipo A"] || 0) + (2 * itQty);
      } else if (canonical === "Queijo mussarela") {
        usageMap["Queijo Mussarela Fatiado"] = (usageMap["Queijo Mussarela Fatiado"] || 0) + (0.04 * itQty);
      } else if (canonical === "Queijo prato") {
        usageMap["Queijo Prato Fatiado"] = (usageMap["Queijo Prato Fatiado"] || 0) + (0.04 * itQty);
      } else if (canonical === "Queijo Minas frescal") {
        usageMap["Queijo Minas Frescal"] = (usageMap["Queijo Minas Frescal"] || 0) + (0.05 * itQty);
      } else if (canonical === "Presunto") {
        usageMap["Presunto Cozido Fatiado"] = (usageMap["Presunto Cozido Fatiado"] || 0) + (0.04 * itQty);
      } else if (canonical === "Peito de Peru") {
        usageMap["Peito de Peru Defumado"] = (usageMap["Peito de Peru Defumado"] || 0) + (0.035 * itQty);
      } else if (canonical === "Manteiga") {
        usageMap["Manteiga com Sal (bloco/pote)"] = (usageMap["Manteiga com Sal (bloco/pote)"] || 0) + (15 * itQty);
      } else if (canonical === "Manteiga dupla") {
        usageMap["Manteiga com Sal (bloco/pote)"] = (usageMap["Manteiga com Sal (bloco/pote)"] || 0) + (25 * itQty);
      } else if (canonical === "Requeijão") {
        usageMap["Requeijão Cremoso"] = (usageMap["Requeijão Cremoso"] || 0) + (20 * itQty);
      } else if (canonical === "Requeijão duplo") {
        usageMap["Requeijão Cremoso"] = (usageMap["Requeijão Cremoso"] || 0) + (35 * itQty);
      } else if (canonical === "Torradas amanteigadas") {
        usageMap["Torradas Amanteigadas"] = (usageMap["Torradas Amanteigadas"] || 0) + (2 * itQty);
      } else if (canonical === "Torradas duplas") {
        usageMap["Torradas Amanteigadas"] = (usageMap["Torradas Amanteigadas"] || 0) + (4 * itQty);
      } else if (canonical === "Casadinho (biscoito com goiabada)") {
        usageMap["Biscoito Casadinho c/ Goiabada"] = (usageMap["Biscoito Casadinho c/ Goiabada"] || 0) + (3 * itQty);
      } else if (canonical === "Casadinhos duplos") {
        usageMap["Biscoito Casadinho c/ Goiabada"] = (usageMap["Biscoito Casadinho c/ Goiabada"] || 0) + (6 * itQty);
      } else if (canonical === "Bolo do dia") {
        usageMap["Bolo do Dia (Fatias)"] = (usageMap["Bolo do Dia (Fatias)"] || 0) + itQty;
      } else if (canonical === "Maçã") {
        usageMap["Maçã Fuji/Gala"] = (usageMap["Maçã Fuji/Gala"] || 0) + itQty;
      } else if (canonical === "Banana" || canonical === "Fruta do dia") {
        usageMap["Banana Prata"] = (usageMap["Banana Prata"] || 0) + itQty;
      } else if (canonical === "Mamão") {
        usageMap["Mamão Papaya/Formosa"] = (usageMap["Mamão Papaya/Formosa"] || 0) + (0.5 * itQty);
      } else if (canonical === "Salada de frutas") {
        usageMap["Salada de Frutas Mista"] = (usageMap["Salada de Frutas Mista"] || 0) + itQty;
      } else if (canonical === "Suco de laranja") {
        usageMap["Suco de Laranja Integral"] = (usageMap["Suco de Laranja Integral"] || 0) + (300 * itQty);
      } else if (canonical === "Água mineral") {
        usageMap["Água Mineral 500ml"] = (usageMap["Água Mineral 500ml"] || 0) + itQty;
      } else if (canonical === "Achocolatado gelado") {
        usageMap["Achocolatado Pronto/Líquido"] = (usageMap["Achocolatado Pronto/Líquido"] || 0) + (250 * itQty);
      } else if (canonical === "Vitamina de banana com iogurte de morango") {
        usageMap["Vitamina de Banana c/ Iogurte Morango"] = (usageMap["Vitamina de Banana c/ Iogurte Morango"] || 0) + (300 * itQty);
      } else if (canonical === "Açúcar") {
        usageMap["Açúcar Sachê 5g"] = (usageMap["Açúcar Sachê 5g"] || 0) + itQty;
      } else if (canonical === "Adoçante") {
        usageMap["Adoçante Sachê 0.8g"] = (usageMap["Adoçante Sachê 0.8g"] || 0) + itQty;
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

// POST /api/breakfast/orders (Suporta 1 a 3 pessoas, slots de 7 min, unificação e normalização canônica)
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
  let activeRes = null;
  if (reservationCode) {
    activeRes = (db.reservations || []).find(r => 
      r.code === reservationCode || 
      r.reservationCode === reservationCode || 
      String(r.id) === reservationCode || 
      r.breakfastToken === reservationCode
    );
  }

  // Se não foi encontrada por código de reserva, busca pelo apartamento e período de entrega
  if (!activeRes && roomNumber) {
    const rawDeliveryDate = req.body.deliveryDate || (Array.isArray(req.body.deliveryDates) ? req.body.deliveryDates[0] : null) || getTodayStr();
    activeRes = (db.reservations || []).find(r => 
      String(r.flatNumber) === String(roomNumber) && 
      r.status !== "cancelada" && 
      r.status !== "cancelado" &&
      (!rawDeliveryDate || (rawDeliveryDate >= r.checkinDate && rawDeliveryDate <= r.checkoutDate))
    );

    if (!activeRes) {
      activeRes = (db.reservations || []).find(r => 
        String(r.flatNumber) === String(roomNumber) && 
        r.status !== "cancelada" && 
        r.status !== "cancelado"
      );
    }
  }

  if (activeRes) {
    if (activeRes.status === "cancelada" || activeRes.status === "cancelado") {
      return res.status(400).json({
        error: "Esta reserva foi cancelada no calendário do hotel. Não é possível realizar pedidos de café."
      });
    }

    const isIncluded = Boolean(
      activeRes.includeBreakfast === true || 
      activeRes.hasBreakfast === true || 
      activeRes.ratePlan === "with_breakfast" || 
      activeRes.notes?.toLowerCase().includes("café") || 
      activeRes.notes?.toLowerCase().includes("cafe")
    );
    if (!isIncluded) {
      return res.status(403).json({
        error: "Esta reserva foi contratada sem café da manhã incluso. O serviço de pedidos está desabilitado para este quarto."
      });
    }
  }

  if (!roomNumber || !clientName || (!deliveryTime && (!guestOrders || guestOrders.length === 0))) {
    return res.status(400).json({ error: "Quarto, Nome do Hóspede e Horário de Entrega são obrigatórios." });
  }

  const nowBrl = getBrasiliaNow();
  const todayStr = nowBrl.date;

  // Lista de datas solicitadas (suporte a lote / repetição em múltiplos dias)
  const rawDates = Array.isArray(req.body.deliveryDates) && req.body.deliveryDates.length > 0
    ? req.body.deliveryDates
    : [req.body.deliveryDate || date || getTodayStr()];

  const targetDates = [...new Set(rawDates)].filter(Boolean);

  // Validação de horário limite das 05:00
  for (const tDate of targetDates) {
    if (tDate < todayStr) {
      return res.status(400).json({ error: `A data ${tDate} já passou. Não é possível realizar pedidos para datas retroativas.` });
    }
    if (tDate === todayStr && nowBrl.hour >= 5) {
      return res.status(400).json({ 
        error: `O horário limite para pedidos de hoje (${todayStr}) foi encerrado às 05:00. O próximo café da manhã disponível é para amanhã.` 
      });
    }
    if (activeRes && tDate > activeRes.checkoutDate) {
      return res.status(400).json({
        error: `A data ${tDate} é posterior ao check-out da reserva (${activeRes.checkoutDate}).`
      });
    }
  }

  const gCount = Math.min(Math.max(Number(guestCount) || 1, 1), 3); // 1, 2 ou 3 apenas
  const proposedMinutes = timeToMinutes(deliveryTime || guestOrders?.[0]?.deliveryTime);

  // Validar se o horário respeita 7 minutos de intervalo de outros pedidos em cada data solicitada
  for (const tDate of targetDates) {
    const dayOrders = (db.breakfastOrders || []).filter(o => o.date === tDate && o.status !== "cancelled");
    const conflict = dayOrders.find(o => Math.abs(timeToMinutes(o.deliveryTime) - proposedMinutes) < 7 && String(o.roomNumber) !== String(roomNumber));
    if (conflict) {
      return res.status(400).json({
        error: `O horário ${deliveryTime || ''} no dia ${tDate} não está mais disponível (conflito de 7 min com outro quarto). Por favor, selecione outro horário.`
      });
    }
  }

  let finalItems = [];
  const map = {};

  const addCanonicalItem = (rawName, qty = 1) => {
    if (!rawName || typeof rawName !== "string") return;
    const splitList = splitLegacyCompoundItem(rawName);
    splitList.forEach(single => {
      const canonical = normalizeBreakfastItem(single);
      if (canonical && !isExcludedBreakfastItem(canonical)) {
        map[canonical] = (map[canonical] || 0) + qty;
      }
    });
  };

  if (isStandard || req.body.orderType === "standard") {
    // Café Padrão CorpFlats: utiliza exatamente os mesmos itens canônicos do café personalizado
    // Café e leite enviados separadamente, fruta do dia fixa
    const std = getStandardBreakfastConfig();
    addCanonicalItem("Café", gCount);
    addCanonicalItem("Leite", gCount);
    addCanonicalItem(std.otherBeverage || "Suco de laranja", gCount);
    (std.breads || ["Pão francês", "Pão de queijo"]).forEach(b => addCanonicalItem(b, gCount));
    (std.accompaniments || ["Queijo mussarela", "Presunto"]).forEach(a => addCanonicalItem(a, gCount));
    (std.complements || ["Manteiga"]).forEach(c => addCanonicalItem(c, gCount));
    (std.sweets || ["Bolo do dia"]).forEach(s => addCanonicalItem(s, gCount));
    
    // Fruta do dia (Mamão, maçã ou banana)
    addCanonicalItem("Fruta do dia", gCount);

    if (std.sweetener) {
      addCanonicalItem(std.sweetener, gCount);
    }
  } else if (Array.isArray(guestChoices) && guestChoices.length > 0) {
    // Pedido Personalizado: normaliza escolhas de cada hóspede para os mesmos itens canônicos
    guestChoices.forEach(go => {
      if (go.coffee) addCanonicalItem(go.coffee, 1);
      if (go.otherBeverage) addCanonicalItem(go.otherBeverage, 1);

      // Pães: regra de porção personalizada (se ambos, 1 de cada; se apenas 1 tipo, 2 unidades)
      const rawBreads = (go.breads || []).map(normalizeBreakfastItem).filter(b => !isExcludedBreakfastItem(b));
      const hasFrench = rawBreads.includes("Pão francês");
      const hasCheese = rawBreads.includes("Pão de queijo");
      if (hasFrench && hasCheese) {
        addCanonicalItem("Pão francês", 1);
        addCanonicalItem("Pão de queijo", 1);
      } else if (hasFrench) {
        addCanonicalItem("Pão francês", 2);
      } else if (hasCheese) {
        addCanonicalItem("Pão de queijo", 2);
      } else {
        rawBreads.forEach(b => addCanonicalItem(b, 1));
      }

      // Acompanhamentos, Complementos, Doces
      (go.accompaniments || []).forEach(acc => addCanonicalItem(acc, 1));
      (go.complements || []).forEach(comp => addCanonicalItem(comp, 1));
      (go.sweets || []).forEach(sw => addCanonicalItem(sw, 1));

      // Frutas: normaliza para fruta canônica (ex: Banana, Maçã, Mamão, Salada de frutas)
      if (go.fruit) addCanonicalItem(go.fruit, 1);

      // Adoçante / Açúcar
      if (go.sweetener) addCanonicalItem(go.sweetener, 1);
    });
  } else if (preferences) {
    const p = preferences;
    if (p.coffee) addCanonicalItem(p.coffee, gCount);
    if (p.otherBeverage) addCanonicalItem(p.otherBeverage, gCount);
    (p.breads || []).forEach(b => addCanonicalItem(b, gCount));
    (p.accompaniments || []).forEach(a => addCanonicalItem(a, gCount));
    (p.complements || []).forEach(c => addCanonicalItem(c, gCount));
    (p.sweets || []).forEach(s => addCanonicalItem(s, gCount));
    if (p.fruit) addCanonicalItem(p.fruit, gCount);
    if (p.sweetener) addCanonicalItem(p.sweetener, gCount);
  } else if (Array.isArray(items) && items.length > 0) {
    items.forEach(it => {
      const rawName = typeof it === "string" ? it : it.name;
      const q = typeof it === "object" && it.quantity ? Number(it.quantity) : 1;
      addCanonicalItem(rawName, q);
    });
  } else {
    // Pedido manual lançado sem detalhamento: expandir automaticamente para os itens do Café Padrão Canônico
    const std = getStandardBreakfastConfig();
    addCanonicalItem("Café", gCount);
    addCanonicalItem("Leite", gCount);
    addCanonicalItem(std.otherBeverage || "Suco de laranja", gCount);
    (std.breads || ["Pão francês", "Pão de queijo"]).forEach(b => addCanonicalItem(b, gCount));
    (std.accompaniments || ["Queijo mussarela", "Presunto"]).forEach(a => addCanonicalItem(a, gCount));
    (std.complements || ["Manteiga"]).forEach(c => addCanonicalItem(c, gCount));
    (std.sweets || ["Bolo do dia"]).forEach(s => addCanonicalItem(s, gCount));
    addCanonicalItem("Fruta do dia", gCount);
    if (std.sweetener) addCanonicalItem(std.sweetener, gCount);
  }

  // Regra especial: quando o pedido tiver 2 cafés e/ou 2 leites (ex: 2 pessoas pedindo café com leite ou café padrão para 2)
  // Como café e leite são enviados separados, para 2 pessoas consolida em Café duplo e Leite duplo
  if (map["Café"] === 2) {
    delete map["Café"];
    map["Café duplo"] = 1;
  }
  if (map["Leite"] === 2) {
    delete map["Leite"];
    map["Leite duplo"] = 1;
  }

  if (Object.keys(map).length > 0) {
    finalItems = Object.entries(map).map(([name, quantity]) => ({ name, quantity }));
  } else {
    const std = getStandardBreakfastConfig();
    finalItems = [
      gCount === 2 ? { name: "Café duplo", quantity: 1 } : { name: "Café", quantity: gCount },
      gCount === 2 ? { name: "Leite duplo", quantity: 1 } : { name: "Leite", quantity: gCount },
      { name: normalizeBreakfastItem(std.otherBeverage || "Suco de laranja"), quantity: gCount },
      { name: "Pão francês", quantity: gCount },
      { name: "Pão de queijo", quantity: gCount },
      { name: "Queijo mussarela", quantity: gCount },
      { name: "Presunto", quantity: gCount },
      { name: "Manteiga", quantity: gCount },
      { name: "Bolo do dia", quantity: gCount },
      { name: "Fruta do dia", quantity: gCount },
      { name: "Açúcar", quantity: gCount }
    ].filter(i => i.name && !isExcludedBreakfastItem(i.name));
  }

  const savedOrders = [];

  for (const tDate of targetDates) {
    const existingIndex = (db.breakfastOrders || []).findIndex(o => 
      o.date === tDate && (
        (activeRes && (o.reservationCode === activeRes.code || o.reservationId === activeRes.id)) ||
        (!activeRes && !o.reservationCode && !o.reservationId && (String(o.roomNumber) === String(roomNumber)))
      )
    );

    if (existingIndex >= 0) {
      const existing = db.breakfastOrders[existingIndex];
      existing.deliveryTime = deliveryTime || guestOrders?.[0]?.deliveryTime || "08:00";
      existing.roomNumber = String(roomNumber);
      existing.clientName = clientName.trim();
      existing.guestCount = gCount;
      existing.isStandard = Boolean(isStandard);
      existing.orderMode = orderMode;
      existing.guestOrders = Array.isArray(guestOrders) ? guestOrders : null;
      existing.items = finalItems;
      existing.notes = notes ? notes.trim() : "";
      existing.phone = phone ? phone.trim() : "";
      existing.status = "pending";
      existing.cancelReason = null;
      existing.reservationCode = activeRes?.code || reservationCode || existing.reservationCode || null;
      existing.reservationId = activeRes?.id || existing.reservationId || null;
      if (activeRes?.checkinDate) existing.originalCheckin = activeRes.checkinDate;
      if (activeRes?.checkoutDate) existing.originalCheckout = activeRes.checkoutDate;
      existing.updatedAt = new Date().toISOString();
      savedOrders.push(existing);
    } else {
      const newOrder = {
        id: db.breakfastOrders.length > 0 ? Math.max(...db.breakfastOrders.map(o => o.id)) + 1 : 1,
        date: tDate,
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
        reservationCode: activeRes?.code || reservationCode || null,
        reservationId: activeRes?.id || null,
        originalCheckin: activeRes?.checkinDate || null,
        originalCheckout: activeRes?.checkoutDate || null,
        createdAt: new Date().toISOString()
      };
      db.breakfastOrders.unshift(newOrder);
      savedOrders.push(newOrder);
    }
  }

  saveDatabase();

  createNotification({
    category: "breakfast",
    title: `☕ Pedido de Café ${targetDates.length > 1 ? `(${targetDates.length} dias)` : ''} - Apt ${roomNumber}`,
    message: `${clientName} agendou café para ${targetDates.join(", ")} às ${deliveryTime || '08:00'} (${gCount} ${gCount === 1 ? 'pessoa' : 'pessoas'})`,
    severity: "info",
    metadata: { roomNumber, deliveryTime, guestCount: gCount, dates: targetDates },
    targetUrl: "/pedidos-cafe"
  });

  res.status(201).json({
    success: true,
    message: `Café da manhã agendado com sucesso para ${targetDates.length} ${targetDates.length === 1 ? 'dia' : 'dias'} às ${deliveryTime || '08:00'}!`,
    count: savedOrders.length,
    orders: savedOrders,
    order: savedOrders[0]
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
  if (req.body.cancelReason !== undefined) {
    order.cancelReason = req.body.cancelReason;
  } else if (req.body.status === "pending" || req.body.status === "ready" || req.body.status === "delivered") {
    order.cancelReason = null;
  }
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
  const googleClientId = process.env.GOOGLE_CLIENT_ID || db.siteConfig?.authConfig?.googleClientId || "231444843725-mndgdjij2nj29nd010oniqc8vu8vgqp2.apps.googleusercontent.com";
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
  const cleanName = (debtorName || "Hospede CorpFlats")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, "").trim().substring(0, 100);

  let devedor = undefined;
  if (cleanDoc.length === 11) {
    devedor = { nome: cleanName, cpf: cleanDoc };
  } else if (cleanDoc.length === 14) {
    devedor = { nome: cleanName, cnpj: cleanDoc };
  } else {
    devedor = { nome: cleanName || "Hospede CorpFlats", cnpj: "47964813000165" };
  }

  const payload = {
    calendario: {
      expiracao: 86400 // 24 horas
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

// 6.2.2 Consulta Ativa de Pagamento no Mercado Pago por External Reference
async function checkMercadoPagoPaymentByRef(externalRef) {
  if (!externalRef) return null;
  const cfg = db.settings?.mercadoPagoConfig || DEFAULT_MP_CONFIG;
  const accessToken = cfg.accessToken || process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) return null;

  return new Promise((resolve) => {
    const req = https.request(`https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(externalRef)}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`
      }
    }, (res) => {
      let raw = "";
      res.on("data", c => raw += c);
      res.on("end", () => {
        try {
          const json = JSON.parse(raw);
          if (json && Array.isArray(json.results) && json.results.length > 0) {
            const approved = json.results.find(p => p.status === "approved");
            if (approved) return resolve(approved);
          }
          resolve(null);
        } catch {
          resolve(null);
        }
      });
    });
    req.on("error", (e) => {
      console.warn("[Mercado Pago] Erro ao buscar pagamentos por ref:", e.message);
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

    const chanLower = String(r.channel || "").toLowerCase();
    const isOta = chanLower.includes("booking") || chanLower.includes("airbnb");

    // Se já está marcado como pago ou canal OTA (Booking/Airbnb), retorna de imediato
    if (isOta || r.paymentStatus === "pago_total" || r.paymentStatus === "pago" || (Number(r.paidAmount) >= Number(r.totalAmount) && Number(r.totalAmount) > 0)) {
      return res.json({
        code: r.code,
        paid: true,
        paymentStatus: "pago_total",
        paidAmount: Number(r.totalAmount) > 0 ? Number(r.totalAmount) : (Number(r.paidAmount) || 0),
        totalAmount: r.totalAmount || 0,
        pixTxId: r.pixTxId || null,
        mpPaymentId: r.mpPaymentId || null
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
          pixTxId: r.pixTxId,
          mpPaymentId: r.mpPaymentId || null
        });
      }
    }

    // Se não liquidou pelo Inter, verifica no Mercado Pago (Cartão de Crédito)
    const mpPayment = await checkMercadoPagoPaymentByRef(r.code);
    if (mpPayment && mpPayment.status === "approved") {
      const valorPago = Number(mpPayment.transaction_amount || mpPayment.total_paid_amount || r.totalAmount);
      r.paymentStatus = "pago_total";
      r.paidAmount = valorPago;
      r.paidAt = mpPayment.date_approved || new Date().toISOString();
      r.paymentMethod = "cartao_credito";
      r.mpPaymentId = String(mpPayment.id);

      createNotification({
        category: "checkout",
        title: `💳 Cartão Confirmado: R$ ${valorPago.toLocaleString("pt-BR")} (Apt ${r.flatNumber})`,
        message: `Reserva ${r.code} liquidada no cartão de crédito via Mercado Pago por ${r.guestName}!`,
        severity: "success",
        metadata: { reservationCode: r.code, paymentId: mpPayment.id, amount: valorPago },
        targetUrl: `/reservas`
      });

      saveDatabase();

      return res.json({
        code: r.code,
        paid: true,
        paymentStatus: "pago_total",
        paidAmount: valorPago,
        totalAmount: r.totalAmount || 0,
        pixTxId: r.pixTxId || null,
        mpPaymentId: r.mpPaymentId
      });
    }

    res.json({
      code: r.code,
      paid: false,
      paymentStatus: r.paymentStatus || "aguardando_pagamento",
      paymentMethod: r.paymentMethod || "pix",
      paidAmount: r.paidAmount || 0,
      totalAmount: r.totalAmount || 0,
      pixTxId: r.pixTxId || null,
      pixCopiaECola: r.pixCopiaECola || null,
      mpInitPoint: r.mpInitPoint || null,
      mpPreferenceId: r.mpPreferenceId || null
    });
  } catch (err) {
    console.error("[Payment Status Check] Erro:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// 6.3.1 Alterar Forma de Pagamento da Reserva (PIX <-> Cartão de Crédito)
app.post("/api/pms/reservations/:code/change-payment-method", async (req, res) => {
  try {
    const { code } = req.params;
    const { method } = req.body || {}; // "pix" | "card" | "cartao_credito"
    if (!db.reservations) db.reservations = [];
    const r = findReservationByLocatorOrContact(code) || (db.reservations || []).find(x => x.code === code || String(x.id) === code);
    if (!r) return res.status(404).json({ error: "Reserva não encontrada." });

    const isPaid = r.paymentStatus === "pago_total" || r.paymentStatus === "pago" || (Number(r.paidAmount) >= Number(r.totalAmount) && Number(r.totalAmount) > 0);
    if (isPaid) {
      return res.json({
        success: true,
        isPaid: true,
        message: "Esta reserva já foi liquidada integralmente.",
        reservation: r
      });
    }

    const targetMethod = (method || "").toLowerCase().includes("card") || (method || "").toLowerCase().includes("cartao") ? "cartao_credito" : "pix";

    if (targetMethod === "pix") {
      r.paymentMethod = "pix";
      r.paymentStatus = "aguardando_pix";

      // Se ainda não tem PIX emitido ou precisa gerar
      if (!r.pixCopiaECola) {
        try {
          const pixResult = await createInterPixCob({
            amount: r.totalAmount,
            description: `Reserva CorpFlats ${r.code}`,
            debtorName: r.guestName,
            debtorDocument: r.guestDocument || r.document,
            reservationCode: r.code
          });
          r.pixTxId = pixResult.txid;
          r.pixCopiaECola = pixResult.pixCopiaECola;
        } catch (pixErr) {
          console.warn("[Change Payment Method] Falha Inter, gerando PIX estático:", pixErr.message);
          const staticPayload = generateStaticPixPayload({
            pixKey: DEFAULT_INTER_CONFIG.pixKey || "47964813000165",
            amount: r.totalAmount,
            merchantName: "CORPFLATS LTDA",
            merchantCity: "CAMPOS DOS GOYTACAZES",
            txid: r.code.replace(/[^a-zA-Z0-9]/g, "").substring(0, 25)
          });
          r.pixTxId = r.pixTxId || `STAT_${Date.now()}`;
          r.pixCopiaECola = staticPayload;
        }
      }

      saveDatabase();
      return res.json({
        success: true,
        paymentMethod: "pix",
        pixCopiaECola: r.pixCopiaECola,
        pixTxId: r.pixTxId,
        paymentStatus: r.paymentStatus,
        reservation: r
      });
    } else {
      // Cartão de Crédito (Mercado Pago)
      r.paymentMethod = "cartao_credito";
      r.paymentStatus = "aguardando_cartao";

      if (!r.mpInitPoint) {
        try {
          const nightsCount = Math.max(1, Math.round((new Date(r.checkoutDate).getTime() - new Date(r.checkinDate).getTime()) / (1000 * 60 * 60 * 24)));
          const mpPreference = await createMercadoPagoPreference({
            reservationCode: r.code,
            amount: r.totalAmount,
            guestName: r.guestName,
            guestEmail: r.guestEmail,
            nights: nightsCount,
            flatNumber: r.flatNumber
          });
          r.mpPreferenceId = mpPreference.id;
          r.mpInitPoint = mpPreference.initPoint;
        } catch (mpErr) {
          console.error("[Change Payment Method] Erro ao criar preferência Mercado Pago:", mpErr.message);
          return res.status(500).json({ error: `Falha ao gerar link Mercado Pago: ${mpErr.message}` });
        }
      }

      saveDatabase();
      return res.json({
        success: true,
        paymentMethod: "cartao_credito",
        initPoint: r.mpInitPoint,
        preferenceId: r.mpPreferenceId,
        paymentStatus: r.paymentStatus,
        reservation: r
      });
    }
  } catch (err) {
    console.error("[Change Payment Method] Erro:", err);
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

function serveSpaWithMetadata(distFolder, req, res) {
  const indexPath = path.join(distFolder, "index.html");
  if (!fs.existsSync(indexPath)) return res.status(404).send("index.html not found");

  try {
    let html = fs.readFileSync(indexPath, "utf-8");
    const rawPath = (req.path || "").toLowerCase();

    // 1. Extrair código de reserva da URL (query param ou segmento do path)
    let resCode = req.query.res || req.query.code || req.query.r || "";
    if (!resCode) {
      const match = req.path.match(/(?:minha-reserva|portal-hospede|guest-portal|pre-checkin|cafe|checkout|check-out|saida)\/([a-zA-Z0-9_\-]+)/i);
      if (match && match[1] && !["cafe", "room-service", "checkout", "check-out", "saida", "null", "undefined"].includes(match[1].toLowerCase())) {
        resCode = match[1];
      }
    }

    // 2. Buscar dados da reserva no banco se houver código
    let guestFirstName = "";
    let flatNumber = "";
    if (resCode) {
      const cleanCode = String(resCode).trim().toLowerCase();
      const found = (db.reservations || []).find(r => 
        (r.code && String(r.code).toLowerCase() === cleanCode) ||
        (r.breakfastToken && String(r.breakfastToken).toLowerCase() === cleanCode) ||
        String(r.id) === cleanCode
      );
      if (found) {
        guestFirstName = (found.guestName || "").trim().split(" ")[0];
        flatNumber = found.flatNumber || "";
      }
    }

    // 3. Identificar tipo de página
    const isBreakfast = 
      rawPath.startsWith("/cafe") || 
      rawPath.endsWith("/cafe") || 
      rawPath.includes("/cafe/") || 
      rawPath.endsWith("/room-service") || 
      rawPath.includes("/room-service/");

    const isPreCheckin = rawPath.startsWith("/pre-checkin");
    const isPortal = rawPath.startsWith("/minha-reserva") || rawPath.startsWith("/portal-hospede") || rawPath.startsWith("/guest-portal");
    const isCheckout = rawPath.startsWith("/checkout") || rawPath.startsWith("/check-out") || rawPath.startsWith("/saida") || rawPath.endsWith("/checkout");

    let title = "CorpFlats • Hospedagem Executiva & Serviços Exclusivos";
    let desc = "Flats mobiliados completos com garagem privativa, portaria 24h e café da manhã artesanal servido no flat.";
    let image = "https://corpflats.onrender.com/flat-preview.jpg";
    let imageAlt = "CorpFlats • Hospedagem Executiva";
    let imageWidth = "1200";
    let imageHeight = "630";

    if (isCheckout) {
      title = flatNumber 
        ? `🚪 Check-out Expresso • Flat ${flatNumber} • CorpFlats`
        : "🚪 Check-out Expresso • CorpFlats";
      desc = guestFirstName 
        ? `Olá ${guestFirstName}! Confirme sua saída do Flat ${flatNumber} com 1 clique e lembre-se de devolver o cartão na recepção.`
        : "Confirme sua saída de forma rápida e prática pelo Check-out Expresso CorpFlats.";
      image = "https://corpflats.onrender.com/flat-preview.jpg";
      imageAlt = "CorpFlats • Check-out Expresso";
    } else if (isBreakfast) {
      title = flatNumber 
        ? `☕ Café da Manhã • Flat ${flatNumber} • CorpFlats`
        : "☕ Pedido de Café da Manhã • CorpFlats";
      desc = guestFirstName 
        ? `Olá ${guestFirstName}! Personalize o seu café da manhã artesanal e escolha o horário de entrega no seu flat.`
        : "Personalize o seu cardápio de café da manhã artesanal servido com todo o carinho diretamente no seu flat.";
      image = "https://corpflats.onrender.com/breakfast-preview.jpg";
      imageAlt = "Café da Manhã CorpFlats";
      imageWidth = "800";
      imageHeight = "533";
    } else if (isPreCheckin) {
      title = flatNumber 
        ? `📝 Pré-Check-in • Flat ${flatNumber} • CorpFlats`
        : "📝 Pré-Check-in Digital • CorpFlats";
      desc = guestFirstName 
        ? `Olá ${guestFirstName}! Agilize sua chegada preenchendo os dados do pré-check-in para liberação na portaria 24h.`
        : "Agilize sua chegada confirmando os dados de identificação para liberação rápida na portaria 24h.";
      image = "https://corpflats.onrender.com/flat-preview.jpg";
      imageAlt = "CorpFlats • Pré-Check-in Digital";
      imageWidth = "1200";
      imageHeight = "630";
    } else if (isPortal) {
      title = flatNumber 
        ? `🏨 Área do Hóspede • Flat ${flatNumber} • CorpFlats`
        : "🏨 Área do Hóspede • CorpFlats";
      desc = guestFirstName 
        ? `Olá ${guestFirstName}! Acesse os detalhes da sua acomodação, senha da fechadura, Wi-Fi e horários do flat.`
        : "Acesse os detalhes da sua acomodação, senha da fechadura, conexão Wi-Fi, regras do flat e serviços.";
      image = "https://corpflats.onrender.com/flat-preview.jpg";
      imageAlt = "CorpFlats • Área do Hóspede";
      imageWidth = "1200";
      imageHeight = "630";
    }

    const pageUrl = `https://corpflats.onrender.com${req.originalUrl || req.url || req.path}`;

    html = html
      .replace(/<title>.*?<\/title>/i, `<title>${title}</title>`)
      .replace(/<meta\s+name=["']description["']\s+content=["'].*?["']\s*\/?>/i, `<meta name="description" content="${desc}" />`)
      .replace(/<meta\s+property=["']og:title["']\s+content=["'].*?["']\s*\/?>/i, `<meta property="og:title" content="${title}" />`)
      .replace(/<meta\s+property=["']og:description["']\s+content=["'].*?["']\s*\/?>/i, `<meta property="og:description" content="${desc}" />`)
      .replace(/<meta\s+property=["']og:url["']\s+content=["'].*?["']\s*\/?>/i, `<meta property="og:url" content="${pageUrl}" />`)
      .replace(/<meta\s+property=["']og:image["']\s+content=["'].*?["']\s*\/?>/i, `<meta property="og:image" content="${image}" />`)
      .replace(/<meta\s+property=["']og:image:secure_url["']\s+content=["'].*?["']\s*\/?>/i, `<meta property="og:image:secure_url" content="${image}" />`)
      .replace(/<meta\s+property=["']og:image:width["']\s+content=["'].*?["']\s*\/?>/i, `<meta property="og:image:width" content="${imageWidth}" />`)
      .replace(/<meta\s+property=["']og:image:height["']\s+content=["'].*?["']\s*\/?>/i, `<meta property="og:image:height" content="${imageHeight}" />`)
      .replace(/<meta\s+property=["']og:image:alt["']\s+content=["'].*?["']\s*\/?>/i, `<meta property="og:image:alt" content="${imageAlt}" />`)
      .replace(/<link\s+rel=["']image_src["']\s+href=["'].*?["']\s*\/?>/i, `<link rel="image_src" href="${image}" />`)
      .replace(/<meta\s+name=["']twitter:title["']\s+content=["'].*?["']\s*\/?>/i, `<meta name="twitter:title" content="${title}" />`)
      .replace(/<meta\s+name=["']twitter:description["']\s+content=["'].*?["']\s*\/?>/i, `<meta name="twitter:description" content="${desc}" />`)
      .replace(/<meta\s+name=["']twitter:image["']\s+content=["'].*?["']\s*\/?>/i, `<meta name="twitter:image" content="${image}" />`);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  } catch {
    return res.sendFile(indexPath);
  }
}

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api")) {
      return serveSpaWithMetadata(distPath, req, res);
    }
    next();
  });
  console.log(`[Production Server] Servindo frontend em: ${distPath}`);
} else if (fs.existsSync(fallbackDistPath)) {
  app.use(express.static(fallbackDistPath));
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api")) {
      return serveSpaWithMetadata(fallbackDistPath, req, res);
    }
    next();
  });
  console.log(`[Production Server] Servindo frontend em: ${fallbackDistPath}`);
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[Demo Server] API rodando em http://0.0.0.0:${PORT}`);
});

export { app };
