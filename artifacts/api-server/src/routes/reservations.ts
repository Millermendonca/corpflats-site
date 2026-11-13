import { Router, type IRouter } from "express";
import { db, flatsTable, reservationsTable, cleaningRequestsTable, appSettingsTable, usersTable } from "@workspace/db";
import { eq, and, gte, lte, inArray, sql } from "drizzle-orm";
import { fetchSpreadsheet, detectCheckouts, detectCheckins, parseSpreadsheet } from "../lib/onedrive";
import { runSync } from "../lib/sync";
import {
  SyncReservationsResponse,
  ListCheckoutsQueryParams,
  ListCheckoutsResponse,
  ListCheckinsQueryParams,
  ListCheckinsResponse,
  ListCleaningRequestsQueryParams,
  ListCleaningRequestsResponse,
  CreateCleaningRequestBody,
  CreateCleaningRequestResponse,
} from "@workspace/api-zod";

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

// POST /reservations/sync
router.post("/reservations/sync", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  // Check admin
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || user.role !== "admin") {
    res.status(403).json({ error: "Apenas administradores podem sincronizar" });
    return;
  }

  req.log.info("Starting OneDrive sync (manual trigger)");
  try {
    const result = await runSync();
    res.json(SyncReservationsResponse.parse({
      ...result,
      message: "Sincronização concluída com sucesso",
    }));
  } catch (err: any) {
    req.log.error({ err }, "OneDrive sync failed");
    const status = err?.message?.includes("não configurado") ? 400 : 500;
    res.status(status).json({ error: err?.message ?? "Erro ao sincronizar" });
  }
});

// GET /reservations/checkouts
router.get("/reservations/checkouts", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const params = ListCheckoutsQueryParams.safeParse(req.query);
  const dateStr = params.success && params.data.date ? params.data.date : today();

  // Get cleaning requests for the exact selected date only.
  // The dashboard shows one day at a time; fetching forward caused mismatches
  // where future-date requests were returned without a matching client-side request.
  const requests = await db
    .select()
    .from(cleaningRequestsTable)
    .where(eq(cleaningRequestsTable.requestDate, dateStr))
    .orderBy(cleaningRequestsTable.flatId);

  if (requests.length === 0) {
    res.json([]);
    return;
  }

  const flatIds = [...new Set(requests.map((r) => r.flatId))];
  const flats = await db.select().from(flatsTable).where(inArray(flatsTable.id, flatIds));
  const flatById: Record<number, typeof flats[0]> = {};
  for (const f of flats) flatById[f.id] = f;

  // For each checkout request, detect whether the flat has a check-in on its
  // own checkout date (not the query date). A check-in means: the flat is
  // occupied on that date AND was not occupied the day before (new guest arriving).
  // Pre-load the relevant reservations for efficiency.
  const requestDates = [...new Set(requests.map((r) => r.requestDate))];
  const checkinsByFlatDate = new Map<string, boolean>(); // "flatId|date" → isCheckin

  for (const reqDate of requestDates) {
    const dateReservations = await db
      .select()
      .from(reservationsTable)
      .where(eq(reservationsTable.reservationDate, reqDate));

    for (const res of dateReservations) {
      if (!res.guestInfo) continue; // empty cell — not occupied

      // Check if there was a different (or no) guest the day before
      const prevDate = new Date(reqDate);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateStr = prevDate.toISOString().substring(0, 10);

      const [prevRes] = await db
        .select()
        .from(reservationsTable)
        .where(
          and(
            eq(reservationsTable.flatId, res.flatId),
            eq(reservationsTable.reservationDate, prevDateStr)
          )
        );

      // It's a check-in if prev day is empty or has a different guest
      const isCheckin = !prevRes?.guestInfo || prevRes.guestInfo !== res.guestInfo;
      if (isCheckin) {
        checkinsByFlatDate.set(`${res.flatId}|${reqDate}`, true);
      }
    }
  }

  // Detect which flats have a check-in on their specific checkout date
  // (not on the query date — each checkout request has its own date)
  const flatIdsWithCheckin = new Set<number>(); // legacy — set per-request below

  // Group by flat (take the earliest upcoming request per flat)
  const seenFlats = new Set<number>();
  const result: any[] = [];

  for (const req_ of requests) {
    if (seenFlats.has(req_.flatId)) continue;
    seenFlats.add(req_.flatId);

    const flat = flatById[req_.flatId];
    if (!flat) continue;

    // Get assigned user name
    let assignedUsername: string | null = null;
    if (req_.assignedUserId) {
      const [u] = await db.select().from(usersTable).where(eq(usersTable.id, req_.assignedUserId));
      assignedUsername = u?.username ?? null;
    }

    // Check-in on this specific checkout's date (not the query date)
    const hasCheckinOnCheckoutDate = checkinsByFlatDate.get(`${flat.id}|${req_.requestDate}`) ?? false;

    result.push({
      flatId: flat.id,
      flatNumber: flat.number,
      checkoutDate: req_.requestDate,
      hasCheckinToday: hasCheckinOnCheckoutDate,
      isOccupied: flat.isOccupied,
      cleaningRequest: {
        id: req_.id,
        flatId: req_.flatId,
        flatNumber: flat.number,
        requestDate: req_.requestDate,
        source: req_.source,
        status: req_.status,
        assignedUserId: req_.assignedUserId ?? null,
        assignedUsername,
        pendingObservation: req_.pendingObservation ?? null,
        willCleanAt: req_.willCleanAt?.toISOString() ?? null,
        cleaningStartedAt: req_.cleaningStartedAt?.toISOString() ?? null,
        completedAt: req_.completedAt?.toISOString() ?? null,
        createdAt: req_.createdAt.toISOString(),
        updatedAt: req_.updatedAt?.toISOString() ?? req_.createdAt.toISOString(),
      },
    });
  }

  // Sort: hasCheckinToday first, then by date
  result.sort((a, b) => {
    if (a.hasCheckinToday && !b.hasCheckinToday) return -1;
    if (!a.hasCheckinToday && b.hasCheckinToday) return 1;
    return a.checkoutDate.localeCompare(b.checkoutDate);
  });

  res.json(ListCheckoutsResponse.parse(result));
});

// GET /reservations/checkins
router.get("/reservations/checkins", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const params = ListCheckinsQueryParams.safeParse(req.query);
  const dateStr = params.success && params.data.date ? params.data.date : today();

  const checkins = await db
    .select()
    .from(reservationsTable)
    .where(eq(reservationsTable.reservationDate, dateStr));

  if (checkins.length === 0) {
    res.json([]);
    return;
  }

  const flatIds = checkins.map((c) => c.flatId);
  const flats = await db.select().from(flatsTable).where(inArray(flatsTable.id, flatIds));
  const flatById: Record<number, typeof flats[0]> = {};
  for (const f of flats) flatById[f.id] = f;

  // Detect real check-ins (not just occupied — must be start of a stay)
  const result: any[] = [];
  for (const c of checkins) {
    const prevDay = new Date(dateStr);
    prevDay.setDate(prevDay.getDate() - 1);
    const prevDate = prevDay.toISOString().substring(0, 10);

    const [prev] = await db
      .select()
      .from(reservationsTable)
      .where(and(eq(reservationsTable.flatId, c.flatId), eq(reservationsTable.reservationDate, prevDate)));

    // It's a check-in if prev day is empty or has different guest
    const isCheckin = !prev || prev.guestInfo !== c.guestInfo;
    if (!isCheckin) continue;

    const flat = flatById[c.flatId];
    if (!flat) continue;
    result.push({ flatId: flat.id, flatNumber: flat.number, checkinDate: dateStr });
  }

  res.json(ListCheckinsResponse.parse(result));
});

export default router;
