/**
 * Background sync scheduler.
 *
 * Uses a self-rescheduling setTimeout so the interval is re-read from the DB
 * after each run — meaning changes to sync_interval_minutes take effect on
 * the next cycle without requiring a server restart.
 */
import { logger } from "./logger";
import { runSync, getSyncIntervalMinutes } from "./sync";

let schedulerTimer: ReturnType<typeof setTimeout> | null = null;
let running = false;

async function tick(): Promise<void> {
  if (running) {
    logger.warn("scheduler: previous sync still in progress, skipping this tick");
  } else {
    running = true;
    try {
      logger.info("scheduler: starting automatic sync");
      const result = await runSync();
      logger.info(result, "scheduler: automatic sync completed");
    } catch (err) {
      // Log but never crash — a transient OneDrive or network error must not
      // bring down the API server.
      logger.error({ err }, "scheduler: automatic sync failed");
    } finally {
      running = false;
    }
  }

  // Re-read interval from DB so updated settings take effect immediately.
  let intervalMinutes = 60;
  try {
    intervalMinutes = await getSyncIntervalMinutes();
  } catch (err) {
    logger.error({ err }, "scheduler: failed to read sync interval, defaulting to 60 min");
  }

  const intervalMs = intervalMinutes * 60 * 1000;
  logger.info({ intervalMinutes }, "scheduler: next sync scheduled");
  schedulerTimer = setTimeout(tick, intervalMs);
}

/**
 * Start the automatic sync scheduler.
 * The first sync runs after one full interval (not immediately on startup) to
 * avoid hammering OneDrive before the server is fully initialised.
 */
export async function startScheduler(): Promise<void> {
  if (schedulerTimer !== null) {
    logger.warn("scheduler: already started, ignoring duplicate call");
    return;
  }

  let intervalMinutes = 60;
  try {
    intervalMinutes = await getSyncIntervalMinutes();
  } catch (err) {
    logger.error({ err }, "scheduler: failed to read initial sync interval, defaulting to 60 min");
  }

  const intervalMs = intervalMinutes * 60 * 1000;
  logger.info({ intervalMinutes }, "scheduler: started, first sync in configured interval");
  schedulerTimer = setTimeout(tick, intervalMs);
}

/**
 * Stop the scheduler (useful for graceful shutdown or tests).
 */
export function stopScheduler(): void {
  if (schedulerTimer !== null) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
    logger.info("scheduler: stopped");
  }
}
