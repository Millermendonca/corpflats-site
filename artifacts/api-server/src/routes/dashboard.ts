import { Router, type IRouter } from "express";
import { db, cleaningRequestsTable, usersTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { GetDashboardSummaryQueryParams, GetDashboardSummaryResponse } from "@workspace/api-zod";

const router: IRouter = Router();

function requireAuth(req: any, res: any): number | null {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Não autenticado" });
    return null;
  }
  return userId;
}

function today(): string {
  return new Date().toISOString().substring(0, 10);
}

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const params = GetDashboardSummaryQueryParams.safeParse(req.query);
  const dateStr = params.success && params.data.date ? params.data.date : today();

  const requests = await db
    .select()
    .from(cleaningRequestsTable)
    .where(eq(cleaningRequestsTable.requestDate, dateStr));

  let totalCheckouts = requests.length;
  let totalClean = 0, totalPending = 0, totalCleaning = 0, totalWillClean = 0, totalDirty = 0;

  for (const r of requests) {
    if (r.status === "clean") totalClean++;
    else if (r.status === "pending_issue") totalPending++;
    else if (r.status === "cleaning_now") totalCleaning++;
    else if (r.status === "will_clean") totalWillClean++;
    else totalDirty++;
  }

  // Stats by user
  const userIds = [...new Set(requests.filter((r) => r.assignedUserId).map((r) => r.assignedUserId!))];
  const users = userIds.length
    ? await db.select().from(usersTable).where(inArray(usersTable.id, userIds))
    : [];
  const userById: Record<number, typeof users[0]> = {};
  for (const u of users) userById[u.id] = u;

  const byUserMap: Record<number, { userId: number; username: string; count: number }> = {};
  for (const r of requests) {
    if (!r.assignedUserId) continue;
    if (!byUserMap[r.assignedUserId]) {
      byUserMap[r.assignedUserId] = {
        userId: r.assignedUserId,
        username: userById[r.assignedUserId]?.username ?? "Desconhecido",
        count: 0,
      };
    }
    byUserMap[r.assignedUserId].count++;
  }

  res.json(GetDashboardSummaryResponse.parse({
    date: dateStr,
    totalCheckouts,
    totalClean,
    totalPending,
    totalCleaning,
    totalWillClean,
    totalDirty,
    byUser: Object.values(byUserMap),
  }));
});

export default router;
