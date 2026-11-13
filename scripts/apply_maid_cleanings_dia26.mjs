import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.resolve(__dirname, '../data/database.json');
const BACKUP_DIR = path.resolve(__dirname, '../data/backups');

if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

const raw = fs.readFileSync(DB_PATH, 'utf-8');
const db = JSON.parse(raw);

// 1. Cria cópia de segurança
const backupPath = path.join(BACKUP_DIR, `database_backup_pre_dia26_${Date.now()}.json`);
fs.writeFileSync(backupPath, raw, 'utf-8');
console.log(`[Backup] Salvo com sucesso em: ${backupPath}`);

// 2. Calcula IDs
let maxReqId = Math.max(...(db.cleaningRequests || []).map(r => Number(r.id) || 0), 1335);
let maxStmtSeq = 0;
(db.maidStatementEntries || []).forEach(e => {
  const m = (e.id || '').match(/_(\d+)$/);
  if (m) {
    const num = parseInt(m[1], 10);
    if (num > maxStmtSeq) maxStmtSeq = num;
  }
});
if (maxStmtSeq < 20260925) maxStmtSeq = 20260925;

console.log(`[IDs Iniciais] maxReqId: ${maxReqId}, maxStmtSeq: ${maxStmtSeq}`);

const flatsToAdd = [
  { flatNumber: '313', flatId: 7, start: '13:30', end: '14:05' },
  { flatNumber: '408', flatId: 8, start: '14:15', end: '14:50' },
  { flatNumber: '511', flatId: 11, start: '15:00', end: '15:35' },
  { flatNumber: '907', flatId: 18, start: '15:45', end: '16:20' },
  { flatNumber: '1004', flatId: 19, start: '16:30', end: '17:05' }
];

const nowIso = new Date().toISOString();

for (const f of flatsToAdd) {
  // Evitar duplicidade caso já exista para Grazi em 2026-09-26
  const existingReq = (db.cleaningRequests || []).find(r => 
    String(r.flatNumber) === f.flatNumber && 
    (r.requestDate === '2026-09-26' || r.effectiveDate === '2026-09-26') &&
    r.assignedUserId === 3
  );

  let reqId;
  if (!existingReq) {
    maxReqId++;
    reqId = maxReqId;
    const req = {
      id: reqId,
      flatId: f.flatId,
      flatNumber: f.flatNumber,
      requestDate: '2026-09-26',
      effectiveDate: '2026-09-26',
      executionDate: '2026-09-26',
      source: 'admin_manual',
      status: 'clean',
      assignedUserId: 3,
      assignedUsername: 'Grazi',
      assignedUserName: 'Grazi',
      isVacant: true,
      isPriority: false,
      adminNote: 'Limpeza realizada por Grazi',
      pendingObservation: null,
      durationMinutes: 35,
      cleaningStartedAt: `2026-09-26T${f.start}:00.000Z`,
      completedAt: `2026-09-26T${f.end}:00.000Z`,
      addedBy: 'admin',
      addedAt: nowIso,
      createdAt: `2026-09-26T${f.end}:00.000Z`,
      updatedAt: nowIso
    };
    db.cleaningRequests.push(req);
    console.log(`[Req +] Adicionado cleaningRequest #${req.id} para Flat ${f.flatNumber} (Grazi) em 26/09`);
  } else {
    reqId = existingReq.id;
    console.log(`[Req Existe] cleaningRequest #${reqId} já existe para Flat ${f.flatNumber} (Grazi)`);
  }

  // Extrato da Camareira
  const existingStmt = (db.maidStatementEntries || []).find(e =>
    e.userId === 3 &&
    e.entryType === 'credit' &&
    e.entryDate === '2026-09-26' &&
    e.description === `Diária — Flat ${f.flatNumber}`
  );

  if (!existingStmt) {
    maxStmtSeq++;
    const stmtId = `stmt_3_${reqId}_${maxStmtSeq}`;
    const stmt = {
      id: stmtId,
      userId: 3,
      cleaningRequestId: reqId,
      paymentId: null,
      entryType: 'credit',
      amount: 23.25,
      description: `Diária — Flat ${f.flatNumber}`,
      entryDate: '2026-09-26',
      createdAt: `2026-09-26T${f.end}:00.000Z`
    };
    db.maidStatementEntries.push(stmt);
    console.log(`[Extrato +] Lançado crédito ${stmtId}: Diária Flat ${f.flatNumber} (R$ 23,25) para Grazi`);
  } else {
    console.log(`[Extrato Existe] Crédito já existe no extrato para Flat ${f.flatNumber}`);
  }

  // Audit log
  if (!db.auditLogs) db.auditLogs = [];
  db.auditLogs.unshift({
    id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: nowIso,
    level: 'info',
    category: 'cleaning',
    action: 'CLEANING_RECORD_ADDED_BY_ADMIN',
    actor: { name: 'admin', role: 'admin' },
    details: {
      requestId: reqId,
      flatNumber: f.flatNumber,
      requestDate: '2026-09-26',
      assignedMaidName: 'Grazi',
      addedBy: 'admin',
      addedAt: nowIso
    }
  });
}

// 3. Ordenação
db.cleaningRequests.sort((a, b) => Number(a.id) - Number(b.id));
db.maidStatementEntries.sort((a, b) => a.entryDate.localeCompare(b.entryDate) || a.createdAt.localeCompare(b.createdAt));

// 4. Salva database.json
fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
console.log(`[Sucesso] database.json atualizado com sucesso!`);
