import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.resolve(__dirname, "../data/database.json");
const BACKUP_DIR = path.resolve(__dirname, "../data/backups");
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// 1. Carrega banco de dados
const raw = fs.readFileSync(DB_PATH, "utf-8");
const db = JSON.parse(raw);

// Cria cópia de segurança prévia
const backupPath = path.join(BACKUP_DIR, `database_backup_pre_regularizacao_${Date.now()}.json`);
fs.writeFileSync(backupPath, raw, "utf-8");
console.log(`[Backup] Salvo com sucesso em: ${backupPath}`);

let maxReqId = Math.max(...(db.cleaningRequests || []).map(r => Number(r.id) || 0), 1260);
let maxStmtSeq = 0;
(db.maidStatementEntries || []).forEach(e => {
  const m = (e.id || "").match(/_(\d+)$/);
  if (m) {
    const num = parseInt(m[1], 10);
    if (num > maxStmtSeq) maxStmtSeq = num;
  }
});
if (maxStmtSeq < 161) maxStmtSeq = 161;

console.log(`[IDs Iniciais] maxReqId: ${maxReqId}, maxStmtSeq: ${maxStmtSeq}`);

function addStatementCredit(userId, reqId, flatNum, amount, entryDate, timeStr = "18:00:00") {
  if (!db.maidStatementEntries) db.maidStatementEntries = [];
  
  // Evitar duplicidade pelo cleaningRequestId
  const exists = db.maidStatementEntries.some(e => e.cleaningRequestId === reqId && e.userId === userId && e.entryType === "credit");
  if (exists) {
    console.log(`[Extrato] Crédito já existente para Req #${reqId} (Flat ${flatNum}, User ${userId}).`);
    return;
  }

  maxStmtSeq++;
  const stmtId = `stmt_${userId}_${reqId}_${maxStmtSeq}`;
  const entry = {
    id: stmtId,
    userId,
    cleaningRequestId: reqId,
    paymentId: null,
    entryType: "credit",
    amount,
    description: `Diária — Flat ${flatNum}`,
    entryDate,
    createdAt: `${entryDate}T${timeStr}.000Z`
  };
  db.maidStatementEntries.push(entry);
  console.log(`[Extrato +] Lançado ${stmtId}: ${entry.description} -> R$ ${amount} para User ${userId} em ${entryDate}`);
}

// -----------------------------------------------------------------------------
// 1. DIA 22/09/2026: Flat 511 para Grazi (User 3, R$ 23,25)
// -----------------------------------------------------------------------------
let req511_22 = (db.cleaningRequests || []).find(r => String(r.flatNumber) === "511" && r.requestDate === "2026-09-22");
if (!req511_22) {
  maxReqId++;
  req511_22 = {
    id: maxReqId,
    flatId: 11,
    flatNumber: "511",
    requestDate: "2026-09-22",
    effectiveDate: "2026-09-22",
    executionDate: "2026-09-22",
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
    adminNote: "Limpeza de checkout realizada por Grazi",
    leavingGuest: "Marcos Neves / Miller Pessanha",
    arrivingGuest: "Ana Lúcia",
    pendingObservation: null,
    willCleanAt: null,
    cleaningStartedAt: "2026-09-22T17:10:00.000Z",
    completedAt: "2026-09-22T17:45:00.000Z",
    durationMinutes: 35,
    createdAt: "2026-09-22T17:45:00.000Z",
    updatedAt: "2026-09-22T17:45:00.000Z"
  };
  db.cleaningRequests.push(req511_22);
  console.log(`[22/09 Req +] Criado Req #${req511_22.id} para Flat 511 (Grazi)`);
} else {
  req511_22.status = "clean";
  req511_22.assignedUserId = 3;
  req511_22.assignedUsername = "Grazi";
  req511_22.assignedUserName = "Grazi";
  req511_22.completedAt = "2026-09-22T17:45:00.000Z";
}
addStatementCredit(3, req511_22.id, "511", 23.25, "2026-09-22", "17:45:00");

// -----------------------------------------------------------------------------
// 2. DIA 23/09/2026: Grazi limpou 211, 408, 509, 511, 904, 907 (+ manteve 512)
// -----------------------------------------------------------------------------
// Flat 509 (Stayover Heverton Martins)
let req509_23 = (db.cleaningRequests || []).find(r => String(r.flatNumber) === "509" && r.requestDate === "2026-09-23");
if (!req509_23) {
  maxReqId++;
  req509_23 = {
    id: maxReqId,
    flatId: 10,
    flatNumber: "509",
    requestDate: "2026-09-23",
    effectiveDate: "2026-09-23",
    executionDate: "2026-09-23",
    source: "stayover",
    status: "clean",
    assignedUserId: 3,
    assignedUsername: "Grazi",
    assignedUserName: "Grazi",
    isVacant: false,
    isPriority: false,
    isExtended: false,
    twinBeds: false,
    extraMattress: false,
    adminNote: "Limpeza de estada (stayover) realizada por Grazi",
    leavingGuest: "Heverton Martins",
    arrivingGuest: "Heverton Martins",
    pendingObservation: null,
    willCleanAt: null,
    cleaningStartedAt: "2026-09-23T14:10:00.000Z",
    completedAt: "2026-09-23T14:45:00.000Z",
    durationMinutes: 35,
    createdAt: "2026-09-23T14:45:00.000Z",
    updatedAt: "2026-09-23T14:45:00.000Z"
  };
  db.cleaningRequests.push(req509_23);
  console.log(`[23/09 Req +] Criado Req #${req509_23.id} para Flat 509 (Grazi)`);
} else {
  req509_23.status = "clean";
  req509_23.assignedUserId = 3;
  req509_23.assignedUsername = "Grazi";
  req509_23.assignedUserName = "Grazi";
  req509_23.completedAt = "2026-09-23T14:45:00.000Z";
}
addStatementCredit(3, req509_23.id, "509", 23.25, "2026-09-23", "14:45:00");

// Flat 511 (Stayover Ana Lúcia)
let req511_23 = (db.cleaningRequests || []).find(r => String(r.flatNumber) === "511" && r.requestDate === "2026-09-23");
if (!req511_23) {
  maxReqId++;
  req511_23 = {
    id: maxReqId,
    flatId: 11,
    flatNumber: "511",
    requestDate: "2026-09-23",
    effectiveDate: "2026-09-23",
    executionDate: "2026-09-23",
    source: "stayover",
    status: "clean",
    assignedUserId: 3,
    assignedUsername: "Grazi",
    assignedUserName: "Grazi",
    isVacant: false,
    isPriority: false,
    isExtended: false,
    twinBeds: false,
    extraMattress: false,
    adminNote: "Limpeza de estada (stayover) realizada por Grazi",
    leavingGuest: "Ana Lúcia",
    arrivingGuest: "Ana Lúcia",
    pendingObservation: null,
    willCleanAt: null,
    cleaningStartedAt: "2026-09-23T14:55:00.000Z",
    completedAt: "2026-09-23T15:30:00.000Z",
    durationMinutes: 35,
    createdAt: "2026-09-23T15:30:00.000Z",
    updatedAt: "2026-09-23T15:30:00.000Z"
  };
  db.cleaningRequests.push(req511_23);
  console.log(`[23/09 Req +] Criado Req #${req511_23.id} para Flat 511 (Grazi)`);
} else {
  req511_23.status = "clean";
  req511_23.assignedUserId = 3;
  req511_23.assignedUsername = "Grazi";
  req511_23.assignedUserName = "Grazi";
  req511_23.completedAt = "2026-09-23T15:30:00.000Z";
}
addStatementCredit(3, req511_23.id, "511", 23.25, "2026-09-23", "15:30:00");

// -----------------------------------------------------------------------------
// 3. DIA 24/09/2026: Grazi limpou 211, 212, 712, 715, 907
// -----------------------------------------------------------------------------
const grazi24Cleanings = [
  { flat: "211", reqId: 1248, start: "13:45", end: "14:20" },
  { flat: "212", reqId: 1247, start: "14:25", end: "15:00" },
  { flat: "715", reqId: 1249, start: "15:55", end: "16:30" },
  { flat: "907", reqId: 1245, start: "16:40", end: "17:15" }
];

for (const c of grazi24Cleanings) {
  const req = (db.cleaningRequests || []).find(r => r.id === c.reqId);
  if (req) {
    req.status = "clean";
    req.assignedUserId = 3;
    req.assignedUsername = "Grazi";
    req.assignedUserName = "Grazi";
    req.isVacant = true;
    req.cleaningStartedAt = `2026-09-24T${c.start}:00.000Z`;
    req.completedAt = `2026-09-24T${c.end}:00.000Z`;
    req.durationMinutes = 35;
    req.updatedAt = `2026-09-24T${c.end}:00.000Z`;
    addStatementCredit(3, req.id, c.flat, 23.25, "2026-09-24", `${c.end}:00`);
    console.log(`[24/09 Grazi] Atualizado Req #${req.id} (Flat ${c.flat}) -> clean`);
  }
}

// Flat 712 em 24/09 (Stayover de Angelo)
let req712_24 = (db.cleaningRequests || []).find(r => String(r.flatNumber) === "712" && r.requestDate === "2026-09-24");
if (!req712_24) {
  maxReqId++;
  req712_24 = {
    id: maxReqId,
    flatId: 14,
    flatNumber: "712",
    requestDate: "2026-09-24",
    effectiveDate: "2026-09-24",
    executionDate: "2026-09-24",
    source: "stayover",
    status: "clean",
    assignedUserId: 3,
    assignedUsername: "Grazi",
    assignedUserName: "Grazi",
    isVacant: false,
    isPriority: false,
    isExtended: false,
    twinBeds: false,
    extraMattress: false,
    adminNote: "Limpeza de estada realizada por Grazi",
    leavingGuest: "Angelo",
    arrivingGuest: "Angelo",
    pendingObservation: null,
    willCleanAt: null,
    cleaningStartedAt: "2026-09-24T15:10:00.000Z",
    completedAt: "2026-09-24T15:45:00.000Z",
    durationMinutes: 35,
    createdAt: "2026-09-24T15:45:00.000Z",
    updatedAt: "2026-09-24T15:45:00.000Z"
  };
  db.cleaningRequests.push(req712_24);
  console.log(`[24/09 Grazi Req +] Criado Req #${req712_24.id} para Flat 712`);
} else {
  req712_24.status = "clean";
  req712_24.assignedUserId = 3;
  req712_24.assignedUsername = "Grazi";
  req712_24.assignedUserName = "Grazi";
  req712_24.completedAt = "2026-09-24T15:45:00.000Z";
}
addStatementCredit(3, req712_24.id, "712", 23.25, "2026-09-24", "15:45:00");

// -----------------------------------------------------------------------------
// 4. DIA 24/09/2026: Cris limpou 116, 313, 511, 512, 904
// -----------------------------------------------------------------------------
const cris24Cleanings = [
  { flat: "116", reqId: 1244, start: "13:40", end: "14:15" },
  { flat: "313", reqId: 1251, start: "14:20", end: "14:55" },
  { flat: "511", reqId: 1243, start: "15:00", end: "15:35" },
  { flat: "512", reqId: 1241, start: "15:40", end: "16:20" },
  { flat: "904", reqId: 1242, start: "16:25", end: "17:00" }
];

for (const c of cris24Cleanings) {
  const req = (db.cleaningRequests || []).find(r => r.id === c.reqId);
  if (req) {
    req.status = "clean";
    req.assignedUserId = 2;
    req.assignedUsername = "Cris";
    req.assignedUserName = "Cris";
    req.isVacant = true;
    req.cleaningStartedAt = `2026-09-24T${c.start}:00.000Z`;
    req.completedAt = `2026-09-24T${c.end}:00.000Z`;
    req.durationMinutes = 35;
    req.updatedAt = `2026-09-24T${c.end}:00.000Z`;
    addStatementCredit(2, req.id, c.flat, 22.50, "2026-09-24", `${c.end}:00`);
    console.log(`[24/09 Cris] Atualizado Req #${req.id} (Flat ${c.flat}) -> clean`);
  }
}

// -----------------------------------------------------------------------------
// 5. DIA 24/09/2026: Flat 408 (Yan foi no-show, quarto não precisou limpar)
// -----------------------------------------------------------------------------
const resYan = (db.reservations || []).find(r => r.id === 199 || (String(r.flatNumber) === "408" && r.checkinDate === "2026-09-23"));
if (resYan) {
  resYan.status = "no_show";
  resYan.checkoutDone = true;
  resYan.notes = resYan.notes 
    ? `${resYan.notes}\n[2026-09-24 18:00] No-Show confirmado. Quarto permaneceu higienizado.`
    : `[2026-09-24 18:00] No-Show confirmado. Quarto permaneceu higienizado.`;
  console.log(`[408 No-Show] Reserva de Yan (#${resYan.id}) atualizada para status: no_show`);
}
const req408_24 = (db.cleaningRequests || []).find(r => r.id === 1246 || (String(r.flatNumber) === "408" && r.requestDate === "2026-09-24"));
if (req408_24) {
  req408_24.status = "no_show";
  req408_24.isVacant = true;
  req408_24.completedAt = "2026-09-24T18:00:00.000Z";
  req408_24.adminNote = "No Show - Quarto não utilizado / Limpo";
  req408_24.pendingObservation = "No Show - Quarto não utilizado / Limpo";
  req408_24.updatedAt = "2026-09-24T18:00:00.000Z";
  console.log(`[408 No-Show] Req #${req408_24.id} atualizado para status: no_show`);
}

// -----------------------------------------------------------------------------
// 6. DIA 24/09/2026: Flat 113 (Thayla estendeu até sábado 26/09)
// -----------------------------------------------------------------------------
const resThayla = (db.reservations || []).find(r => r.id === 177 || (String(r.flatNumber) === "113" && r.guestName?.includes("Thayla")));
if (resThayla) {
  resThayla.checkoutDate = "2026-09-26";
  resThayla.totalAmount = 1050;
  resThayla.paidAmount = 1050;
  resThayla.paymentStatus = "pago_total";
  resThayla.dailyRate = 210;
  resThayla.dailyRates = [
    { date: "2026-09-21", rate: 250, channel: "airbnb", notes: "Diária Airbnb" },
    { date: "2026-09-22", rate: 250, channel: "airbnb", notes: "Diária Airbnb" },
    { date: "2026-09-23", rate: 250, channel: "airbnb", notes: "Diária Airbnb" },
    { date: "2026-09-24", rate: 150, channel: "whatsapp", notes: "Diária extra WhatsApp" },
    { date: "2026-09-25", rate: 150, channel: "whatsapp", notes: "Diária extra WhatsApp" }
  ];
  resThayla.payments = [
    { id: "pay_177_airbnb", amount: 750, method: "airbnb", category: "diarias", date: "2026-09-21T19:16:54.190Z", notes: "3 diárias originais Airbnb" },
    { id: "pay_177_whatsapp", amount: 300, method: "pix", category: "diarias", date: "2026-09-24T18:00:00.000Z", notes: "2 diárias extras WhatsApp (R$ 150 cada)" }
  ];
  resThayla.notes = resThayla.notes
    ? `${resThayla.notes}\n[2026-09-24 18:00] Estadia prorrogada até 2026-09-26 (sábado). 3 diárias Airbnb (R$ 750) + 2 diárias extras WhatsApp (R$ 300).`
    : `[2026-09-24 18:00] Estadia prorrogada até 2026-09-26 (sábado). 3 diárias Airbnb (R$ 750) + 2 diárias extras WhatsApp (R$ 300).`;
  resThayla.calendarSequence = (resThayla.calendarSequence || 0) + 1;
  resThayla.updatedAt = new Date().toISOString();
  console.log(`[113 Extensão] Reserva Thayla (#${resThayla.id}) prorrogada para checkout: 2026-09-26 (Multi-canal: Airbnb + WhatsApp R$ 1050)`);
}

const req113_24 = (db.cleaningRequests || []).find(r => r.id === 1250 || (String(r.flatNumber) === "113" && r.requestDate === "2026-09-24"));
if (req113_24) {
  req113_24.status = "extended";
  req113_24.isExtended = true;
  req113_24.adminNote = "Hóspede estendeu até 2026-09-26";
  req113_24.pendingObservation = "Hóspede estendeu até 2026-09-26";
  req113_24.updatedAt = "2026-09-24T18:00:00.000Z";
  console.log(`[113 Extensão] Req #${req113_24.id} atualizado para status: extended`);
}

// Garante agendamento de limpeza de checkout no sábado 26/09
let req113_26 = (db.cleaningRequests || []).find(r => String(r.flatNumber) === "113" && r.requestDate === "2026-09-26");
if (!req113_26) {
  maxReqId++;
  req113_26 = {
    id: maxReqId,
    flatId: 1,
    flatNumber: "113",
    requestDate: "2026-09-26",
    effectiveDate: "2026-09-26",
    executionDate: "2026-09-26",
    source: "checkout",
    status: "dirty",
    assignedUserId: null,
    assignedUsername: null,
    assignedUserName: null,
    isVacant: false,
    isPriority: false,
    isExtended: false,
    twinBeds: false,
    extraMattress: false,
    adminNote: null,
    leavingGuest: "Thayla",
    arrivingGuest: null,
    pendingObservation: null,
    willCleanAt: null,
    cleaningStartedAt: null,
    completedAt: null,
    durationMinutes: null,
    createdAt: "2026-09-24T18:00:00.000Z",
    updatedAt: "2026-09-24T18:00:00.000Z"
  };
  db.cleaningRequests.push(req113_26);
  console.log(`[113 Checkout Sábado +] Criado Req #${req113_26.id} para Flat 113 em 2026-09-26`);
}

// -----------------------------------------------------------------------------
// 7. Ordena arrays e persiste no arquivo database.json
// -----------------------------------------------------------------------------
db.cleaningRequests.sort((a, b) => Number(a.id) - Number(b.id));
db.maidStatementEntries.sort((a, b) => a.entryDate.localeCompare(b.entryDate) || a.createdAt.localeCompare(b.createdAt));

fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
console.log(`[Sucesso] database.json atualizado com êxito!`);

// -----------------------------------------------------------------------------
// 8. Resumo Final dos Extratos
// -----------------------------------------------------------------------------
function printMaidSummary(userId, name) {
  const entries = db.maidStatementEntries.filter(e => e.userId === userId);
  const total = entries.reduce((s, e) => e.entryType === "credit" ? s + Number(e.amount) : s - Number(e.amount), 0);
  console.log(`\n======================================================`);
  console.log(`EXTRATO FINAL: ${name} (User ID ${userId})`);
  console.log(`Total de lançamentos: ${entries.length}`);
  console.log(`Saldo Atualizado: R$ ${total.toFixed(2)}`);
  console.log(`Últimos 10 lançamentos:`);
  entries.slice(-10).forEach(e => {
    console.log(`  [${e.entryDate}] ${e.description} | R$ ${e.amount.toFixed(2)} | ID: ${e.id}`);
  });
}

printMaidSummary(2, "Cris");
printMaidSummary(3, "Grazi");
