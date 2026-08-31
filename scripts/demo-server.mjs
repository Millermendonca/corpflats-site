import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// In-memory state for demonstration
let currentUser = { id: 1, username: "admin", role: "admin" };

const users = [
  { id: 1, username: "admin", role: "admin" },
  { id: 2, username: "Cris", role: "camareira" },
  { id: 3, username: "Grazi", role: "camareira" },
];

const flats = [
  { id: 1, number: "101", isOccupied: true, updatedAt: new Date().toISOString() },
  { id: 2, number: "102", isOccupied: false, updatedAt: new Date().toISOString() },
  { id: 3, number: "103", isOccupied: false, updatedAt: new Date().toISOString() },
  { id: 4, number: "104", isOccupied: false, updatedAt: new Date().toISOString() },
  { id: 5, number: "105", isOccupied: true, updatedAt: new Date().toISOString() },
  { id: 6, number: "106", isOccupied: true, updatedAt: new Date().toISOString() },
  { id: 7, number: "201", isOccupied: false, updatedAt: new Date().toISOString() },
  { id: 8, number: "202", isOccupied: false, updatedAt: new Date().toISOString() },
  { id: 9, number: "203", isOccupied: true, updatedAt: new Date().toISOString() },
  { id: 10, number: "204", isOccupied: false, updatedAt: new Date().toISOString() },
  { id: 11, number: "205", isOccupied: true, updatedAt: new Date().toISOString() },
];

function getTodayStr(offsetDays = 0) {
  const d = new Date();
  if (offsetDays !== 0) d.setDate(d.getDate() + offsetDays);
  return d.toISOString().substring(0, 10);
}

const todayStr = getTodayStr(0);
const yesterdayStr = getTodayStr(-1);
const tomorrowStr = getTodayStr(1);

let cleaningRequests = [
  {
    id: 1,
    flatId: 1,
    requestDate: todayStr,
    source: "checkout",
    status: "dirty",
    assignedUserId: null,
    isVacant: false,
    pendingObservation: null,
    willCleanAt: null,
    cleaningStartedAt: null,
    completedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 2,
    flatId: 2,
    requestDate: todayStr,
    source: "checkout",
    status: "cleaning_now",
    assignedUserId: 2,
    isVacant: true,
    pendingObservation: null,
    willCleanAt: new Date(Date.now() - 35 * 60000).toISOString(),
    cleaningStartedAt: new Date(Date.now() - 20 * 60000).toISOString(),
    completedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 3,
    flatId: 3,
    requestDate: todayStr,
    source: "checkout",
    status: "will_clean",
    assignedUserId: 3,
    isVacant: true,
    pendingObservation: null,
    willCleanAt: new Date(Date.now() - 15 * 60000).toISOString(),
    cleaningStartedAt: null,
    completedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 4,
    flatId: 4,
    requestDate: todayStr,
    source: "checkout",
    status: "clean",
    assignedUserId: 2,
    isVacant: true,
    pendingObservation: null,
    willCleanAt: new Date(Date.now() - 120 * 60000).toISOString(),
    cleaningStartedAt: new Date(Date.now() - 90 * 60000).toISOString(),
    completedAt: new Date(Date.now() - 40 * 60000).toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 5,
    flatId: 5,
    requestDate: todayStr,
    source: "checkout",
    status: "pending_issue",
    assignedUserId: 3,
    isVacant: true,
    pendingObservation: "Ar-condicionado vazando água e sem controle remoto",
    willCleanAt: new Date(Date.now() - 80 * 60000).toISOString(),
    cleaningStartedAt: new Date(Date.now() - 50 * 60000).toISOString(),
    completedAt: new Date(Date.now() - 10 * 60000).toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 6,
    flatId: 7,
    requestDate: todayStr,
    source: "checkout",
    status: "dirty",
    assignedUserId: null,
    isVacant: true,
    pendingObservation: null,
    willCleanAt: null,
    cleaningStartedAt: null,
    completedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 7,
    flatId: 8,
    requestDate: todayStr,
    source: "checkout",
    status: "clean",
    assignedUserId: 3,
    isVacant: true,
    pendingObservation: null,
    willCleanAt: new Date(Date.now() - 180 * 60000).toISOString(),
    cleaningStartedAt: new Date(Date.now() - 150 * 60000).toISOString(),
    completedAt: new Date(Date.now() - 110 * 60000).toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 8,
    flatId: 9,
    requestDate: todayStr,
    source: "checkout",
    status: "dirty",
    assignedUserId: null,
    isVacant: false,
    pendingObservation: null,
    willCleanAt: null,
    cleaningStartedAt: null,
    completedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 9,
    flatId: 10,
    requestDate: todayStr,
    source: "checkout",
    status: "dirty",
    assignedUserId: null,
    isVacant: true,
    pendingObservation: null,
    willCleanAt: null,
    cleaningStartedAt: null,
    completedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  // Yesterday's historical data
  {
    id: 10,
    flatId: 1,
    requestDate: yesterdayStr,
    source: "checkout",
    status: "clean",
    assignedUserId: 2,
    isVacant: true,
    pendingObservation: null,
    willCleanAt: yesterdayStr + "T09:00:00Z",
    cleaningStartedAt: yesterdayStr + "T09:15:00Z",
    completedAt: yesterdayStr + "T10:00:00Z",
    createdAt: yesterdayStr + "T08:00:00Z",
    updatedAt: yesterdayStr + "T10:00:00Z",
  },
  {
    id: 11,
    flatId: 6,
    requestDate: yesterdayStr,
    source: "checkout",
    status: "clean",
    assignedUserId: 3,
    isVacant: true,
    pendingObservation: null,
    willCleanAt: yesterdayStr + "T10:30:00Z",
    cleaningStartedAt: yesterdayStr + "T10:45:00Z",
    completedAt: yesterdayStr + "T11:25:00Z",
    createdAt: yesterdayStr + "T08:00:00Z",
    updatedAt: yesterdayStr + "T11:25:00Z",
  },
];

let checkinsList = [
  { flatId: 1, flatNumber: "101", checkinDate: todayStr },
  { flatId: 2, flatNumber: "102", checkinDate: todayStr },
  { flatId: 7, flatNumber: "201", checkinDate: todayStr },
  { flatId: 10, flatNumber: "204", checkinDate: todayStr },
];

let periodicTasks = [
  {
    id: 1,
    name: "Troca de Filtro do Ar-Condicionado",
    description: "Higienizar evaporadora e trocar refil do filtro",
    periodDays: 15,
    isActive: true,
    flatIds: [1, 2, 3, 4, 5, 7, 8, 9, 10],
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
  {
    id: 2,
    name: "Higienização Profunda de Colchão",
    description: "Aspiração e sanitização ultravioleta",
    periodDays: 30,
    isActive: true,
    flatIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    createdAt: new Date(Date.now() - 45 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 45 * 86400000).toISOString(),
  },
  {
    id: 3,
    name: "Inspeção Elétrica e Chuveiro",
    description: "Testar disjuntores, resistências e tomadas",
    periodDays: 20,
    isActive: true,
    flatIds: [1, 2, 3, 7, 8],
    createdAt: new Date(Date.now() - 25 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 25 * 86400000).toISOString(),
  },
];

let periodicExecutions = [
  {
    id: 1,
    periodicTaskId: 1,
    flatId: 1,
    executedByUserId: 2,
    executedAt: new Date(Date.now() - 18 * 86400000).toISOString(),
    notes: "Filtro substituído perfeitamente",
    createdAt: new Date(Date.now() - 18 * 86400000).toISOString(),
  },
  {
    id: 2,
    periodicTaskId: 1,
    flatId: 2,
    executedByUserId: 3,
    executedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    notes: "Tudo em ordem",
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
  },
];

let observations = [
  {
    id: 1,
    flatId: 5,
    flatNumber: "105",
    authorUserId: 3,
    authorUsername: "Grazi",
    category: "defeito",
    text: "Ar-condicionado vazando água pela evaporadora e sem controle remoto",
    status: "aberta",
    resolvedAt: null,
    resolvedByUserId: null,
    resolvedByUsername: null,
    resolvedNote: null,
    createdAt: new Date(Date.now() - 60 * 60000).toISOString(),
    updatedAt: new Date(Date.now() - 60 * 60000).toISOString(),
  },
  {
    id: 2,
    flatId: 2,
    flatNumber: "102",
    authorUserId: 2,
    authorUsername: "Cris",
    category: "manutencao",
    text: "Lâmpada do banheiro principal piscando ao acender",
    status: "aberta",
    resolvedAt: null,
    resolvedByUserId: null,
    resolvedByUsername: null,
    resolvedNote: null,
    createdAt: new Date(Date.now() - 120 * 60000).toISOString(),
    updatedAt: new Date(Date.now() - 120 * 60000).toISOString(),
  },
  {
    id: 3,
    flatId: 7,
    flatNumber: "201",
    authorUserId: 2,
    authorUsername: "Cris",
    category: "outro",
    text: "Hóspede esqueceu carregador de celular tipo C na bancada",
    status: "resolvida",
    resolvedAt: new Date(Date.now() - 30 * 60000).toISOString(),
    resolvedByUserId: 1,
    resolvedByUsername: "admin",
    resolvedNote: "Guardado na gaveta de achados e perdidos na recepção",
    createdAt: new Date(Date.now() - 240 * 60000).toISOString(),
    updatedAt: new Date(Date.now() - 30 * 60000).toISOString(),
  },
];

let appSettings = {
  onedriveLinkConfigured: true,
  onedriveLinkPreview: "onedrive.live.com/.../Planilha_Reservas_Hotel.xlsx",
  syncIntervalMinutes: 60,
  lastSyncedAt: new Date(Date.now() - 15 * 60000).toISOString(),
  sheetName: "Reservas",
  alertHour: 15,
};

// ── Auth Endpoints ──────────────────────────────────────────────────────────
app.get("/api/auth/me", (req, res) => {
  if (!currentUser) return res.status(401).json({ error: "Não autenticado" });
  res.json(currentUser);
});

app.post("/api/auth/login", (req, res) => {
  const { username } = req.body || {};
  const found = users.find(u => u.username.toLowerCase() === (username || "").toLowerCase());
  if (found) {
    currentUser = found;
    return res.json(found);
  }
  // Default login fallback to admin
  currentUser = { id: 1, username: username || "admin", role: username === "cris" || username === "grazi" ? "camareira" : "admin" };
  res.json(currentUser);
});

app.post("/api/auth/logout", (req, res) => {
  currentUser = null;
  res.json({ success: true });
});

// ── Flats Endpoints ─────────────────────────────────────────────────────────
app.get("/api/flats", (req, res) => {
  res.json(flats);
});

app.get("/api/flats/:id", (req, res) => {
  const f = flats.find(x => x.id === Number(req.params.id));
  if (!f) return res.status(404).json({ error: "Flat não encontrado" });
  res.json(f);
});

app.patch("/api/flats/:id", (req, res) => {
  const f = flats.find(x => x.id === Number(req.params.id));
  if (!f) return res.status(404).json({ error: "Flat não encontrado" });
  if (typeof req.body.isOccupied === "boolean") {
    f.isOccupied = req.body.isOccupied;
    f.updatedAt = new Date().toISOString();
  }
  res.json(f);
});

// ── Reservations & Checkouts Endpoints ─────────────────────────────────────
app.get("/api/reservations/checkouts", (req, res) => {
  const dateStr = req.query.date || todayStr;
  const requestsForDate = cleaningRequests.filter(r => r.requestDate === dateStr);

  const result = requestsForDate.map(req_ => {
    const flat = flats.find(f => f.id === req_.flatId) || { id: req_.flatId, number: String(req_.flatId), isOccupied: false };
    const assignedUser = users.find(u => u.id === req_.assignedUserId);
    const hasCheckinToday = checkinsList.some(c => c.flatId === flat.id && c.checkinDate === dateStr);

    return {
      flatId: flat.id,
      flatNumber: flat.number,
      checkoutDate: req_.requestDate,
      hasCheckinToday,
      isOccupied: flat.isOccupied,
      cleaningRequest: {
        id: req_.id,
        flatId: req_.flatId,
        flatNumber: flat.number,
        requestDate: req_.requestDate,
        source: req_.source,
        status: req_.status,
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

  res.json(result);
});

app.get("/api/reservations/checkins", (req, res) => {
  const dateStr = req.query.date || todayStr;
  res.json(checkinsList.filter(c => c.checkinDate === dateStr));
});

// ── Dashboard Summary ───────────────────────────────────────────────────────
app.get("/api/dashboard/summary", (req, res) => {
  const dateStr = req.query.date || todayStr;
  const requestsForDate = cleaningRequests.filter(r => r.requestDate === dateStr);

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
    const u = users.find(x => x.id === r.assignedUserId);
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

// ── Cleaning Actions ────────────────────────────────────────────────────────
app.patch("/api/cleaning/assignments/:requestId/status", (req, res) => {
  const reqId = Number(req.params.requestId);
  const { status, observation, isVacant } = req.body;
  const item = cleaningRequests.find(r => r.id === reqId);
  if (!item) return res.status(404).json({ error: "Solicitação não encontrada" });

  const now = new Date().toISOString();
  if (typeof isVacant === "boolean") {
    item.isVacant = isVacant;
  }
  if (status) {
    item.status = status;
    if (status === "will_clean") {
      item.assignedUserId = currentUser ? currentUser.id : 2;
      item.willCleanAt = now;
    } else if (status === "cleaning_now") {
      item.cleaningStartedAt = now;
    } else if (status === "clean" || status === "pending_issue") {
      item.completedAt = now;
      item.pendingObservation = status === "pending_issue" ? (observation || "Pendência registrada") : null;
    } else if (status === "dirty") {
      item.assignedUserId = null;
      item.willCleanAt = null;
      item.cleaningStartedAt = null;
      item.completedAt = null;
      item.pendingObservation = null;
    }
  }
  item.updatedAt = now;

  const flat = flats.find(f => f.id === item.flatId);
  const assignedUser = users.find(u => u.id === item.assignedUserId);

  res.json({
    ...item,
    flatNumber: flat ? flat.number : String(item.flatId),
    assignedUsername: assignedUser ? assignedUser.username : null,
  });
});

app.post("/api/cleaning/assignments/batch-claim", (req, res) => {
  const { requestIds = [] } = req.body;
  const now = new Date().toISOString();
  let claimed = 0;

  for (const id of requestIds) {
    const item = cleaningRequests.find(r => r.id === id);
    if (item && item.status === "dirty") {
      item.status = "will_clean";
      item.assignedUserId = currentUser ? currentUser.id : 2;
      item.willCleanAt = now;
      item.updatedAt = now;
      claimed++;
    }
  }

  res.json({ claimed, total: requestIds.length });
});

app.get("/api/cleaning/history", (req, res) => {
  const list = cleaningRequests.map(r => {
    const flat = flats.find(f => f.id === r.flatId);
    const assignedUser = users.find(u => u.id === r.assignedUserId);
    return {
      id: r.id,
      flatId: r.flatId,
      flatNumber: flat ? flat.number : String(r.flatId),
      requestDate: r.requestDate,
      status: r.status,
      assignedUserId: r.assignedUserId,
      assignedUsername: assignedUser ? assignedUser.username : null,
      pendingObservation: r.pendingObservation,
      completedAt: r.completedAt,
      createdAt: r.createdAt,
    };
  });
  res.json(list);
});

// ── Periodic Tasks ──────────────────────────────────────────────────────────
app.get("/api/periodic-tasks", (req, res) => {
  res.json(periodicTasks);
});

app.post("/api/periodic-tasks", (req, res) => {
  const { name, description, periodDays = 7, flatIds = [] } = req.body;
  const newTask = {
    id: periodicTasks.length + 1,
    name,
    description: description || null,
    periodDays,
    isActive: true,
    flatIds,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  periodicTasks.push(newTask);
  res.status(201).json(newTask);
});

app.get("/api/periodic-tasks/pending", (req, res) => {
  const result = [];
  for (const task of periodicTasks.filter(t => t.isActive)) {
    for (const flatId of task.flatIds) {
      const flat = flats.find(f => f.id === flatId);
      if (!flat) continue;
      const lastExec = periodicExecutions.find(e => e.periodicTaskId === task.id && e.flatId === flatId);
      let nextDueAt;
      if (lastExec) {
        const d = new Date(lastExec.executedAt);
        d.setDate(d.getDate() + task.periodDays);
        nextDueAt = d.toISOString().substring(0, 10);
      } else {
        nextDueAt = todayStr;
      }
      const daysOverdue = Math.max(0, Math.floor((Date.now() - new Date(nextDueAt).getTime()) / 86400000));

      result.push({
        taskId: task.id,
        taskName: task.name,
        taskDescription: task.description,
        flatId: flat.id,
        flatNumber: flat.number,
        periodDays: task.periodDays,
        lastExecutedAt: lastExec ? lastExec.executedAt : null,
        nextDueAt,
        daysOverdue,
      });
    }
  }
  res.json(result);
});

app.post("/api/periodic-tasks/:id/execute", (req, res) => {
  const taskId = Number(req.params.id);
  const { flatId, notes } = req.body;
  const task = periodicTasks.find(t => t.id === taskId);
  if (!task) return res.status(404).json({ error: "Tarefa não encontrada" });

  const execution = {
    id: periodicExecutions.length + 1,
    periodicTaskId: taskId,
    flatId,
    executedByUserId: currentUser ? currentUser.id : 1,
    executedAt: new Date().toISOString(),
    notes: notes || null,
    createdAt: new Date().toISOString(),
  };
  periodicExecutions.push(execution);

  const nextDue = new Date();
  nextDue.setDate(nextDue.getDate() + task.periodDays);

  res.json({
    ...execution,
    nextDueAt: nextDue.toISOString().substring(0, 10),
  });
});

// ── Observations / Issues ───────────────────────────────────────────────────
app.get("/api/observations", (req, res) => {
  res.json(observations);
});

app.post("/api/observations", (req, res) => {
  const { flatId, category = "outro", text } = req.body;
  const flat = flats.find(f => f.id === flatId);
  const newObs = {
    id: observations.length + 1,
    flatId,
    flatNumber: flat ? flat.number : String(flatId),
    authorUserId: currentUser ? currentUser.id : 1,
    authorUsername: currentUser ? currentUser.username : "admin",
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
  observations.unshift(newObs);
  res.status(201).json(newObs);
});

app.patch("/api/observations/:id/resolve", (req, res) => {
  const id = Number(req.params.id);
  const obs = observations.find(o => o.id === id);
  if (!obs) return res.status(404).json({ error: "Observação não encontrada" });

  obs.status = "resolvida";
  obs.resolvedAt = new Date().toISOString();
  obs.resolvedByUserId = currentUser ? currentUser.id : 1;
  obs.resolvedByUsername = currentUser ? currentUser.username : "admin";
  obs.resolvedNote = req.body.resolvedNote || "Resolvido com sucesso";
  obs.updatedAt = new Date().toISOString();

  res.json(obs);
});

// ── Analytics & Reports ─────────────────────────────────────────────────────
app.get("/api/analytics/report", (req, res) => {
  res.json({
    startDate: getTodayStr(-30),
    endDate: todayStr,
    topFlatsByCleanings: [
      { flatId: 1, flatNumber: "101", count: 18 },
      { flatId: 2, flatNumber: "102", count: 15 },
      { flatId: 4, flatNumber: "104", count: 14 },
      { flatId: 7, flatNumber: "201", count: 12 },
      { flatId: 8, flatNumber: "202", count: 11 },
    ],
    topFlatsByObservations: [
      { flatId: 5, flatNumber: "105", count: 4 },
      { flatId: 2, flatNumber: "102", count: 3 },
      { flatId: 7, flatNumber: "201", count: 2 },
    ],
    observationsByCategory: [
      { category: "defeito", count: 6 },
      { category: "manutencao", count: 4 },
      { category: "outro", count: 3 },
    ],
    cleaningsByDayOfWeek: [
      { dayOfWeek: 0, dayName: "Domingo", count: 22 },
      { dayOfWeek: 1, dayName: "Segunda", count: 18 },
      { dayOfWeek: 2, dayName: "Terça", count: 12 },
      { dayOfWeek: 3, dayName: "Quarta", count: 14 },
      { dayOfWeek: 4, dayName: "Quinta", count: 15 },
      { dayOfWeek: 5, dayName: "Sexta", count: 25 },
      { dayOfWeek: 6, dayName: "Sábado", count: 28 },
    ],
    cleaningsByUser: [
      { userId: 2, username: "Cris", count: 48 },
      { userId: 3, username: "Grazi", count: 42 },
    ],
  });
});

// ── Settings Endpoints ──────────────────────────────────────────────────────
app.get("/api/settings", (req, res) => {
  res.json(appSettings);
});

app.patch("/api/settings", (req, res) => {
  const { onedriveShareUrl, syncIntervalMinutes, sheetName, alertHour } = req.body;
  if (onedriveShareUrl !== undefined) appSettings.onedriveLinkPreview = onedriveShareUrl;
  if (syncIntervalMinutes !== undefined) appSettings.syncIntervalMinutes = syncIntervalMinutes;
  if (sheetName !== undefined) appSettings.sheetName = sheetName;
  if (alertHour !== undefined) appSettings.alertHour = alertHour;
  res.json(appSettings);
});

app.post("/api/reservations/sync", (req, res) => {
  appSettings.lastSyncedAt = new Date().toISOString();
  res.json({
    flatsFound: flats.length,
    reservationsUpserted: 45,
    checkoutsDetected: cleaningRequests.length,
    message: "Sincronização com OneDrive simulada com sucesso!",
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[Demo Server] API rodando em http://localhost:${PORT}`);
});
