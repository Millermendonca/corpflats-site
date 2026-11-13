import { Router, type IRouter } from "express";
import {
  db,
  periodicTasksTable,
  periodicTaskFlatsTable,
  periodicTaskExecutionsTable,
  flatsTable,
  usersTable,
  cleaningRequestsTable,
} from "@workspace/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import {
  ListPeriodicTasksResponse,
  CreatePeriodicTaskBody,
  UpdatePeriodicTaskBody,
  ListPendingPeriodicTasksQueryParams,
  ExecutePeriodicTaskBody,
  ExecutePeriodicTaskResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function requireAuth(req: any, res: any): number | null {
  const userId = req.session?.userId;
  if (!userId) { res.status(401).json({ error: "Não autenticado" }); return null; }
  return userId;
}

async function requireAdmin(req: any, res: any): Promise<boolean> {
  const userId = requireAuth(req, res);
  if (!userId) return false;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || user.role !== "admin") {
    res.status(403).json({ error: "Apenas administradores" });
    return false;
  }
  return true;
}

/**
 * Returns the set of flat IDs the user is authorised to act on.
 * - Admins: unrestricted (null).
 * - Camareiras: only flats they have been assigned to via cleaning_requests.
 */
async function getAuthorizedFlatIds(userId: number): Promise<{ role: string; allowedFlatIds: number[] | null }> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) return { role: "camareira", allowedFlatIds: [] };

  if (user.role === "admin") {
    return { role: "admin", allowedFlatIds: null };
  }

  const assignments = await db
    .selectDistinct({ flatId: cleaningRequestsTable.flatId })
    .from(cleaningRequestsTable)
    .where(eq(cleaningRequestsTable.assignedUserId, userId));

  return { role: "camareira", allowedFlatIds: assignments.map((a) => a.flatId) };
}

/** Build the full task object (with flatIds) for a given task row */
async function enrichTask(task: typeof periodicTasksTable.$inferSelect) {
  const links = await db.select().from(periodicTaskFlatsTable).where(eq(periodicTaskFlatsTable.periodicTaskId, task.id));
  return {
    id: task.id,
    name: task.name,
    description: task.description ?? null,
    periodDays: task.periodDays,
    isActive: task.isActive,
    flatIds: links.map((l) => l.flatId),
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

// GET /periodic-tasks  (admin only)
router.get("/periodic-tasks", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  const tasks = await db.select().from(periodicTasksTable).orderBy(periodicTasksTable.name);
  const enriched = await Promise.all(tasks.map(enrichTask));
  res.json(ListPeriodicTasksResponse.parse(enriched));
});

// POST /periodic-tasks  (admin only)
router.post("/periodic-tasks", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  const userId = (req.session as any).userId as number;

  const parsed = CreatePeriodicTaskBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { name, description, periodDays, isActive, flatIds } = parsed.data;

  const [task] = await db.insert(periodicTasksTable).values({
    name,
    description: description ?? null,
    periodDays: periodDays ?? 7,
    isActive: isActive !== false,
    createdByUserId: userId,
  }).returning();

  if (flatIds && flatIds.length > 0) {
    await db.insert(periodicTaskFlatsTable).values(
      flatIds.map((flatId: number) => ({ periodicTaskId: task.id, flatId }))
    ).onConflictDoNothing();
  }

  res.status(201).json(await enrichTask(task));
});

// GET /periodic-tasks/pending  — must be declared before /:id routes
// Camareiras see only their assigned flats; admins see everything.
router.get("/periodic-tasks/pending", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { role, allowedFlatIds } = await getAuthorizedFlatIds(userId);

  // Camareiras with no assignments get an empty list
  if (role === "camareira" && (!allowedFlatIds || allowedFlatIds.length === 0)) {
    res.json([]);
    return;
  }

  const params = ListPendingPeriodicTasksQueryParams.safeParse(req.query);
  const flatIdFilter = params.success && params.data.flatId ? params.data.flatId : null;

  // Validate flat-id filter against caller's scope for camareiras
  if (role === "camareira" && flatIdFilter && allowedFlatIds && !allowedFlatIds.includes(flatIdFilter)) {
    res.status(403).json({ error: "Acesso negado a este flat" });
    return;
  }

  const now = new Date();
  const todayStr = now.toISOString().substring(0, 10);

  // Active tasks
  const tasks = await db.select().from(periodicTasksTable).where(eq(periodicTasksTable.isActive, true));
  if (tasks.length === 0) { res.json([]); return; }

  const taskIds = tasks.map((t) => t.id);

  // Task-flat links, already filtered by caller's scope
  let links = await db.select().from(periodicTaskFlatsTable)
    .where(inArray(periodicTaskFlatsTable.periodicTaskId, taskIds));

  // Restrict to authorised flats for camareiras
  if (role === "camareira" && allowedFlatIds) {
    links = links.filter((l) => allowedFlatIds.includes(l.flatId));
  }
  // Apply explicit flat filter (already validated against scope above)
  if (flatIdFilter) {
    links = links.filter((l) => l.flatId === flatIdFilter);
  }

  const flatIds = [...new Set(links.map((l) => l.flatId))];
  if (flatIds.length === 0) { res.json([]); return; }

  const flats = await db.select().from(flatsTable).where(inArray(flatsTable.id, flatIds));
  const flatById: Record<number, typeof flats[0]> = {};
  for (const f of flats) flatById[f.id] = f;

  const lastExecutions = await db
    .select({
      periodicTaskId: periodicTaskExecutionsTable.periodicTaskId,
      flatId: periodicTaskExecutionsTable.flatId,
      executedAt: sql<Date>`MAX(${periodicTaskExecutionsTable.executedAt})`.as("executed_at"),
    })
    .from(periodicTaskExecutionsTable)
    .where(inArray(periodicTaskExecutionsTable.periodicTaskId, taskIds))
    .groupBy(periodicTaskExecutionsTable.periodicTaskId, periodicTaskExecutionsTable.flatId);

  const lastExecMap = new Map<string, Date>();
  for (const e of lastExecutions) {
    lastExecMap.set(`${e.periodicTaskId}|${e.flatId}`, new Date(e.executedAt));
  }

  const taskById: Record<number, typeof tasks[0]> = {};
  for (const t of tasks) taskById[t.id] = t;

  const result: any[] = [];
  for (const link of links) {
    const task = taskById[link.periodicTaskId];
    const flat = flatById[link.flatId];
    if (!task || !flat) continue;

    const lastExecAt = lastExecMap.get(`${task.id}|${link.flatId}`) ?? null;
    let nextDueAt: Date;
    if (lastExecAt) {
      nextDueAt = new Date(lastExecAt);
      nextDueAt.setDate(nextDueAt.getDate() + task.periodDays);
    } else {
      nextDueAt = new Date(todayStr);
    }

    const todayDate = new Date(todayStr);
    const diffMs = todayDate.getTime() - nextDueAt.getTime();
    const daysOverdue = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    result.push({
      taskId: task.id,
      taskName: task.name,
      taskDescription: task.description ?? null,
      flatId: flat.id,
      flatNumber: flat.number,
      periodDays: task.periodDays,
      lastExecutedAt: lastExecAt?.toISOString() ?? null,
      nextDueAt: nextDueAt.toISOString().substring(0, 10),
      daysOverdue,
    });
  }

  result.sort((a, b) => b.daysOverdue - a.daysOverdue);
  res.json(result);
});

// PATCH /periodic-tasks/:id  (admin only)
router.patch("/periodic-tasks/:id", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;

  const id = parseInt(req.params.id);
  const [existing] = await db.select().from(periodicTasksTable).where(eq(periodicTasksTable.id, id));
  if (!existing) { res.status(404).json({ error: "Tarefa não encontrada" }); return; }

  const parsed = UpdatePeriodicTaskBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { name, description, periodDays, isActive, flatIds } = parsed.data;

  const updates: any = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (periodDays !== undefined) updates.periodDays = periodDays;
  if (isActive !== undefined) updates.isActive = isActive;

  const [updated] = Object.keys(updates).length > 0
    ? await db.update(periodicTasksTable).set(updates).where(eq(periodicTasksTable.id, id)).returning()
    : [existing];

  if (flatIds !== undefined) {
    await db.delete(periodicTaskFlatsTable).where(eq(periodicTaskFlatsTable.periodicTaskId, id));
    if (flatIds.length > 0) {
      await db.insert(periodicTaskFlatsTable).values(
        flatIds.map((flatId: number) => ({ periodicTaskId: id, flatId }))
      ).onConflictDoNothing();
    }
  }

  res.json(await enrichTask(updated));
});

// DELETE /periodic-tasks/:id  (admin only)
router.delete("/periodic-tasks/:id", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;

  const id = parseInt(req.params.id);
  await db.delete(periodicTaskFlatsTable).where(eq(periodicTaskFlatsTable.periodicTaskId, id));
  await db.delete(periodicTaskExecutionsTable).where(eq(periodicTaskExecutionsTable.periodicTaskId, id));
  await db.delete(periodicTasksTable).where(eq(periodicTasksTable.id, id));
  res.json({ success: true });
});

// POST /periodic-tasks/:id/execute
// Admins: unrestricted.
// Camareiras: may only record execution for flats they are assigned to via cleaning_requests.
router.post("/periodic-tasks/:id/execute", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const id = parseInt(req.params.id);
  const [task] = await db.select().from(periodicTasksTable).where(eq(periodicTasksTable.id, id));
  if (!task) { res.status(404).json({ error: "Tarefa não encontrada" }); return; }

  const parsed = ExecutePeriodicTaskBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { flatId, notes } = parsed.data;

  // Verify the task is linked to this flat
  const [link] = await db.select().from(periodicTaskFlatsTable)
    .where(and(eq(periodicTaskFlatsTable.periodicTaskId, id), eq(periodicTaskFlatsTable.flatId, flatId)));
  if (!link) { res.status(400).json({ error: "Esta tarefa não está vinculada a este flat" }); return; }

  // Enforce assignment-based scope for camareiras
  const { role, allowedFlatIds } = await getAuthorizedFlatIds(userId);
  if (role === "camareira") {
    if (!allowedFlatIds || !allowedFlatIds.includes(flatId)) {
      res.status(403).json({ error: "Você não está atribuída a este flat" });
      return;
    }
  }

  const [execution] = await db.insert(periodicTaskExecutionsTable).values({
    periodicTaskId: id, flatId, executedByUserId: userId, notes: notes ?? null,
  }).returning();

  const nextDueAt = new Date(execution.executedAt);
  nextDueAt.setDate(nextDueAt.getDate() + task.periodDays);

  res.json(ExecutePeriodicTaskResponse.parse({
    id: execution.id,
    periodicTaskId: execution.periodicTaskId,
    flatId: execution.flatId,
    executedByUserId: execution.executedByUserId,
    executedAt: execution.executedAt.toISOString(),
    notes: execution.notes ?? null,
    nextDueAt: nextDueAt.toISOString().substring(0, 10),
  }));
});

export default router;
