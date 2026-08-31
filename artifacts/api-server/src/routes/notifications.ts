import { Router, type IRouter } from "express";
import { db, cleaningRequestsTable, flatsTable, usersTable, appSettingsTable } from "@workspace/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { GetAlertsResponse } from "@workspace/api-zod";

const router: IRouter = Router();

function requireAuth(req: any, res: any): number | null {
  const userId = req.session?.userId;
  if (!userId) { res.status(401).json({ error: "Não autenticado" }); return null; }
  return userId;
}

// GET /notifications/alerts
// Returns in-app alerts for flats with checkout today that haven't been cleaned
// after the configured alert hour.
router.get("/notifications/alerts", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(401).json({ error: "Não autenticado" }); return; }

  // Get alert hour from settings (default: 14)
  const [alertHourSetting] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "alert_hour"));
  const alertHour = alertHourSetting?.value ? parseInt(alertHourSetting.value, 10) : 14;

  const now = new Date();
  const todayStr = now.toISOString().substring(0, 10);
  const currentHour = now.getHours();

  // Only show alerts after the configured hour
  if (currentHour < alertHour) {
    res.json([]);
    return;
  }

  // Find checkout cleaning requests for today that are NOT yet clean
  const incompleteRequests = await db
    .select()
    .from(cleaningRequestsTable)
    .where(
      and(
        eq(cleaningRequestsTable.requestDate, todayStr),
        sql`${cleaningRequestsTable.status} NOT IN ('clean')`,
      )
    );

  if (incompleteRequests.length === 0) {
    res.json([]);
    return;
  }

  const flatIds = [...new Set(incompleteRequests.map((r) => r.flatId))];
  const flats = await db.select().from(flatsTable).where(inArray(flatsTable.id, flatIds));
  const flatById: Record<number, typeof flats[0]> = {};
  for (const f of flats) flatById[f.id] = f;

  const alerts: any[] = [];

  for (const req_ of incompleteRequests) {
    // Filter by role: camareira sees alerts for their own claims or unclaimed flats
    if (user.role === "camareira") {
      const isOwn = req_.assignedUserId === userId;
      const isUnclaimed = req_.assignedUserId == null;
      if (!isOwn && !isUnclaimed) continue;
    }

    const flat = flatById[req_.flatId];
    if (!flat) continue;

    const hoursLate = currentHour - alertHour;
    const severity = hoursLate >= 2 ? "critical" : "warning";

    const statusLabel: Record<string, string> = {
      dirty: "não iniciada",
      will_clean: "prevista mas não iniciada",
      cleaning_now: "em andamento",
      pending_issue: "com pendência",
    };

    alerts.push({
      id: `checkout-${req_.id}`,
      type: "uncleaned_checkout",
      message: `Flat ${flat.number}: limpeza ${statusLabel[req_.status] ?? req_.status} após ${alertHour}h`,
      flatId: flat.id,
      flatNumber: flat.number,
      severity,
      requestId: req_.id,
    });
  }

  res.json(GetAlertsResponse.parse(alerts));
});

export default router;
