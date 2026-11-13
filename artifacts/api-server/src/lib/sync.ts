/**
 * Core sync logic — shared between the manual HTTP trigger and the automatic
 * background scheduler.  This module has no dependency on Express so it can
 * run safely outside of a request context.
 */
import { db, flatsTable, reservationsTable, cleaningRequestsTable, appSettingsTable } from "@workspace/db";
import { eq, and, gte, lte } from "drizzle-orm";
import { fetchSpreadsheet, detectCheckouts } from "./onedrive";
import { logger } from "./logger";

export interface SyncResult {
  flatsFound: number;
  reservationsUpserted: number;
  checkoutsDetected: number;
}

function today(): string {
  return new Date().toISOString().substring(0, 10);
}

/**
 * Run a full OneDrive → database synchronisation.
 *
 * Returns a summary of what was processed, or throws if the sync cannot
 * proceed (e.g. OneDrive URL not configured, network error).
 * Callers are responsible for catching and handling errors.
 */
export async function runSync(): Promise<SyncResult> {
  // Read current settings
  const settings = await db.select().from(appSettingsTable);
  const settingsMap: Record<string, string> = {};
  for (const s of settings) {
    if (s.value) settingsMap[s.key] = s.value;
  }

  const shareUrl = settingsMap["onedrive_share_url"];
  if (!shareUrl) {
    throw new Error("Link do OneDrive não configurado nas Configurações");
  }

  logger.info("runSync: fetching spreadsheet from OneDrive");
  const data = await fetchSpreadsheet(shareUrl, settingsMap["sheet_name"]);
  const checkouts = detectCheckouts(data);

  let flatsFound = 0;
  let reservationsUpserted = 0;

  // Ensure flats exist
  for (const row of data.rows) {
    const existing = await db.select().from(flatsTable).where(eq(flatsTable.number, row.flatNumber));
    if (existing.length === 0) {
      await db.insert(flatsTable).values({ number: row.flatNumber });
    }
    flatsFound++;
  }

  const allFlats = await db.select().from(flatsTable);
  const flatByNumber: Record<string, number> = {};
  for (const f of allFlats) flatByNumber[f.number] = f.id;

  // Reconcile reservations — occupied cells are upserted, empty cells are deleted
  const validDates = data.columnDates.filter(Boolean);

  for (const row of data.rows) {
    const flatId = flatByNumber[row.flatNumber];
    if (!flatId) continue;
    for (let i = 0; i < data.columnDates.length; i++) {
      const date = data.columnDates[i];
      if (!date) continue;
      const guestInfo = row.cells[i];
      if (guestInfo) {
        await db
          .insert(reservationsTable)
          .values({ flatId, reservationDate: date, guestInfo })
          .onConflictDoUpdate({
            target: [reservationsTable.flatId, reservationsTable.reservationDate],
            set: { guestInfo, updatedAt: new Date() },
          });
        reservationsUpserted++;
      } else {
        await db
          .delete(reservationsTable)
          .where(
            and(
              eq(reservationsTable.flatId, flatId),
              eq(reservationsTable.reservationDate, date),
            ),
          );
      }
    }
  }

  // Build current checkout set for reconciliation
  const currentCheckoutSet = new Set(
    checkouts.map((c) => {
      const fid = flatByNumber[c.flatNumber];
      return fid ? `${fid}|${c.checkoutDate}` : null;
    }).filter(Boolean) as string[],
  );

  // Create checkout cleaning requests for future checkouts (idempotent)
  const todayStr = today();
  const futureCheckouts = checkouts.filter((c) => c.checkoutDate >= todayStr);
  for (const co of futureCheckouts) {
    const flatId = flatByNumber[co.flatNumber];
    if (!flatId) continue;
    await db
      .insert(cleaningRequestsTable)
      .values({ flatId, requestDate: co.checkoutDate, source: "checkout", status: "dirty" })
      .onConflictDoNothing();
  }

  // Reconcile stale checkout-origin cleaning requests
  if (validDates.length > 0) {
    const minDate = validDates.reduce((a, b) => (a < b ? a : b));
    const maxDate = validDates.reduce((a, b) => (a > b ? a : b));

    const existingCheckoutRequests = await db
      .select()
      .from(cleaningRequestsTable)
      .where(
        and(
          eq(cleaningRequestsTable.source, "checkout"),
          gte(cleaningRequestsTable.requestDate, minDate),
          lte(cleaningRequestsTable.requestDate, maxDate),
        ),
      );

    for (const req of existingCheckoutRequests) {
      const key = `${req.flatId}|${req.requestDate}`;
      if (!currentCheckoutSet.has(key)) {
        if (req.status === "dirty" || req.status === "will_clean") {
          await db.delete(cleaningRequestsTable).where(eq(cleaningRequestsTable.id, req.id));
        } else if (req.status === "cleaning_now") {
          await db
            .update(cleaningRequestsTable)
            .set({ source: "manual", updatedAt: new Date() })
            .where(eq(cleaningRequestsTable.id, req.id));
        }
      }
    }
  }

  // Update last_synced_at
  await db
    .insert(appSettingsTable)
    .values({ key: "last_synced_at", value: new Date().toISOString() })
    .onConflictDoUpdate({
      target: appSettingsTable.key,
      set: { value: new Date().toISOString(), updatedAt: new Date() },
    });

  logger.info({ flatsFound, reservationsUpserted, checkoutsDetected: futureCheckouts.length }, "runSync: completed");

  return { flatsFound, reservationsUpserted, checkoutsDetected: futureCheckouts.length };
}

/**
 * Read sync_interval_minutes from the DB.
 * Returns the configured value or 60 as a safe default.
 */
export async function getSyncIntervalMinutes(): Promise<number> {
  const settings = await db.select().from(appSettingsTable);
  for (const s of settings) {
    if (s.key === "sync_interval_minutes" && s.value) {
      const n = parseInt(s.value, 10);
      if (!isNaN(n) && n > 0) return n;
    }
  }
  return 60;
}
