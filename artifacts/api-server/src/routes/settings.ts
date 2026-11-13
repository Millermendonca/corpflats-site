import { Router, type IRouter } from "express";
import { db, appSettingsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { GetSettingsResponse, UpdateSettingsBody, UpdateSettingsResponse } from "@workspace/api-zod";
import { validateOneDriveUrl } from "../lib/onedrive";

const router: IRouter = Router();

function requireAuth(req: any, res: any): number | null {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Não autenticado" });
    return null;
  }
  return userId;
}

async function getSettingsMap(): Promise<Record<string, string>> {
  const settings = await db.select().from(appSettingsTable);
  const map: Record<string, string> = {};
  for (const s of settings) {
    if (s.value) map[s.key] = s.value;
  }
  return map;
}

function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}/...`;
  } catch {
    return url.substring(0, 30) + "...";
  }
}

router.get("/settings", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || user.role !== "admin") {
    res.status(403).json({ error: "Apenas administradores" });
    return;
  }

  const map = await getSettingsMap();
  const shareUrl = map["onedrive_share_url"];
  const intervalStr = map["sync_interval_minutes"];
  const lastSynced = map["last_synced_at"];
  const sheetName = map["sheet_name"];

  const alertHourStr = map["alert_hour"];

  res.json(GetSettingsResponse.parse({
    onedriveLinkConfigured: !!shareUrl,
    onedriveLinkPreview: shareUrl ? maskUrl(shareUrl) : null,
    syncIntervalMinutes: intervalStr ? parseInt(intervalStr, 10) : 60,
    lastSyncedAt: lastSynced ?? null,
    sheetName: sheetName ?? null,
    alertHour: alertHourStr ? parseInt(alertHourStr, 10) : null,
  }));
});

router.patch("/settings", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || user.role !== "admin") {
    res.status(403).json({ error: "Apenas administradores" });
    return;
  }

  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { onedriveShareUrl, syncIntervalMinutes, sheetName, alertHour } = parsed.data;

  if (onedriveShareUrl !== undefined) {
    // Validate the share URL against the SSRF allowlist before persisting.
    // This catches misconfigured or malicious URLs before they can be used
    // by the sync endpoint to reach internal services.
    try {
      validateOneDriveUrl(onedriveShareUrl ?? "");
    } catch (err: any) {
      res.status(400).json({ error: err.message });
      return;
    }

    await db
      .insert(appSettingsTable)
      .values({ key: "onedrive_share_url", value: onedriveShareUrl })
      .onConflictDoUpdate({
        target: appSettingsTable.key,
        set: { value: onedriveShareUrl, updatedAt: new Date() },
      });
  }

  if (syncIntervalMinutes !== undefined) {
    await db
      .insert(appSettingsTable)
      .values({ key: "sync_interval_minutes", value: String(syncIntervalMinutes) })
      .onConflictDoUpdate({
        target: appSettingsTable.key,
        set: { value: String(syncIntervalMinutes), updatedAt: new Date() },
      });
  }

  if (sheetName !== undefined) {
    await db
      .insert(appSettingsTable)
      .values({ key: "sheet_name", value: sheetName })
      .onConflictDoUpdate({
        target: appSettingsTable.key,
        set: { value: sheetName, updatedAt: new Date() },
      });
  }

  if (alertHour !== undefined && alertHour !== null) {
    if (!Number.isInteger(alertHour) || alertHour < 0 || alertHour > 23) {
      res.status(400).json({ error: "alertHour deve ser um inteiro entre 0 e 23" });
      return;
    }
    await db
      .insert(appSettingsTable)
      .values({ key: "alert_hour", value: String(alertHour) })
      .onConflictDoUpdate({
        target: appSettingsTable.key,
        set: { value: String(alertHour), updatedAt: new Date() },
      });
  }

  const map = await getSettingsMap();
  const shareUrl = map["onedrive_share_url"];
  const intervalStr = map["sync_interval_minutes"];
  const lastSynced = map["last_synced_at"];

  res.json(UpdateSettingsResponse.parse({
    onedriveLinkConfigured: !!shareUrl,
    onedriveLinkPreview: shareUrl ? maskUrl(shareUrl) : null,
    syncIntervalMinutes: intervalStr ? parseInt(intervalStr, 10) : 60,
    lastSyncedAt: lastSynced ?? null,
    sheetName: map["sheet_name"] ?? null,
    alertHour: map["alert_hour"] ? parseInt(map["alert_hour"], 10) : null,
  }));
});

export default router;
