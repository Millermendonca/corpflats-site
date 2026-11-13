import { Router, type IRouter } from "express";
import { db, cleaningRequestsTable, flatObservationsTable, flatsTable, usersTable } from "@workspace/db";
import { eq, and, gte, lte, inArray, sql, count } from "drizzle-orm";
import { GetAnalyticsReportQueryParams, GetAnalyticsReportResponse } from "@workspace/api-zod";

const router: IRouter = Router();

function requireAuth(req: any, res: any): number | null {
  const userId = req.session?.userId;
  if (!userId) { res.status(401).json({ error: "Não autenticado" }); return null; }
  return userId;
}

const DAY_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

// GET /analytics/report
router.get("/analytics/report", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || user.role !== "admin") {
    res.status(403).json({ error: "Apenas administradores" });
    return;
  }

  const params = GetAnalyticsReportQueryParams.safeParse(req.query);
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const startDate = (params.success && params.data.startDate) ? params.data.startDate : thirtyDaysAgo.toISOString().substring(0, 10);
  const endDate   = (params.success && params.data.endDate)   ? params.data.endDate   : today.toISOString().substring(0, 10);

  // ── Top flats by cleanings (completed) ──────────────────────────────────────
  const cleaningRows = await db
    .select({
      flatId: cleaningRequestsTable.flatId,
      count: count(cleaningRequestsTable.id),
    })
    .from(cleaningRequestsTable)
    .where(
      and(
        gte(cleaningRequestsTable.requestDate, startDate),
        lte(cleaningRequestsTable.requestDate, endDate),
        sql`${cleaningRequestsTable.status} IN ('clean', 'pending_issue')`
      )
    )
    .groupBy(cleaningRequestsTable.flatId)
    .orderBy(sql`count(${cleaningRequestsTable.id}) DESC`);

  const allFlats = await db.select().from(flatsTable);
  const flatById: Record<number, typeof allFlats[0]> = {};
  for (const f of allFlats) flatById[f.id] = f;

  const topFlatsByCleanings = cleaningRows.slice(0, 10).map((r) => ({
    flatId: r.flatId,
    flatNumber: flatById[r.flatId]?.number ?? "?",
    count: r.count,
  }));

  // ── Top flats by observations ───────────────────────────────────────────────
  const obsRows = await db
    .select({
      flatId: flatObservationsTable.flatId,
      count: count(flatObservationsTable.id),
    })
    .from(flatObservationsTable)
    .where(
      and(
        gte(flatObservationsTable.createdAt, new Date(startDate)),
        lte(flatObservationsTable.createdAt, new Date(endDate + "T23:59:59"))
      )
    )
    .groupBy(flatObservationsTable.flatId)
    .orderBy(sql`count(${flatObservationsTable.id}) DESC`);

  const topFlatsByObservations = obsRows.slice(0, 10).map((r) => ({
    flatId: r.flatId,
    flatNumber: flatById[r.flatId]?.number ?? "?",
    count: r.count,
  }));

  // ── Observations by category ────────────────────────────────────────────────
  const catRows = await db
    .select({
      category: flatObservationsTable.category,
      count: count(flatObservationsTable.id),
    })
    .from(flatObservationsTable)
    .where(
      and(
        gte(flatObservationsTable.createdAt, new Date(startDate)),
        lte(flatObservationsTable.createdAt, new Date(endDate + "T23:59:59"))
      )
    )
    .groupBy(flatObservationsTable.category)
    .orderBy(sql`count(${flatObservationsTable.id}) DESC`);

  const observationsByCategory = catRows.map((r) => ({
    category: r.category,
    count: r.count,
  }));

  // ── Cleanings by day of week ────────────────────────────────────────────────
  const dayRows = await db
    .select({
      dayOfWeek: sql<number>`EXTRACT(DOW FROM ${cleaningRequestsTable.completedAt})`.as("day_of_week"),
      count: count(cleaningRequestsTable.id),
    })
    .from(cleaningRequestsTable)
    .where(
      and(
        gte(cleaningRequestsTable.requestDate, startDate),
        lte(cleaningRequestsTable.requestDate, endDate),
        sql`${cleaningRequestsTable.status} IN ('clean', 'pending_issue')`,
        sql`${cleaningRequestsTable.completedAt} IS NOT NULL`
      )
    )
    .groupBy(sql`EXTRACT(DOW FROM ${cleaningRequestsTable.completedAt})`)
    .orderBy(sql`EXTRACT(DOW FROM ${cleaningRequestsTable.completedAt})`);

  const cleaningsByDayOfWeek = dayRows.map((r) => ({
    dayOfWeek: r.dayOfWeek,
    dayName: DAY_NAMES[r.dayOfWeek] ?? "?",
    count: r.count,
  }));

  // ── Cleanings by user ────────────────────────────────────────────────────────
  const userRows = await db
    .select({
      assignedUserId: cleaningRequestsTable.assignedUserId,
      count: count(cleaningRequestsTable.id),
    })
    .from(cleaningRequestsTable)
    .where(
      and(
        gte(cleaningRequestsTable.requestDate, startDate),
        lte(cleaningRequestsTable.requestDate, endDate),
        sql`${cleaningRequestsTable.status} IN ('clean', 'pending_issue')`,
        sql`${cleaningRequestsTable.assignedUserId} IS NOT NULL`
      )
    )
    .groupBy(cleaningRequestsTable.assignedUserId)
    .orderBy(sql`count(${cleaningRequestsTable.id}) DESC`);

  const allUsers = await db.select().from(usersTable);
  const userById: Record<number, typeof allUsers[0]> = {};
  for (const u of allUsers) userById[u.id] = u;

  const cleaningsByUser = userRows
    .filter((r) => r.assignedUserId != null)
    .map((r) => ({
      userId: r.assignedUserId!,
      username: userById[r.assignedUserId!]?.username ?? "?",
      count: r.count,
    }));

  res.json(GetAnalyticsReportResponse.parse({
    startDate,
    endDate,
    topFlatsByCleanings,
    topFlatsByObservations,
    observationsByCategory,
    cleaningsByDayOfWeek,
    cleaningsByUser,
  }));
});

export default router;
