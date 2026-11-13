import { Router, type IRouter } from "express";
import { db, cleaningRequestsTable, flatsTable, usersTable, reservationsTable, pushTokensTable } from "@workspace/db";
import { eq, and, gte, lte, inArray, isNull, sql } from "drizzle-orm";
import { sendPushNotifications } from "../lib/push";
import {
  ListCleaningRequestsQueryParams,
  ListCleaningRequestsResponse,
  CreateCleaningRequestBody,
  CreateCleaningRequestResponse,
  UpdateCleaningStatusParams,
  UpdateCleaningStatusBody,
  UpdateCleaningStatusResponse,
  BatchClaimFlatsBody,
  BatchClaimFlatsResponse,
  ListCleaningHistoryQueryParams,
  ListCleaningHistoryResponse,
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

function startOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function endOfMonth(): string {
  const d = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
  return d.toISOString().substring(0, 10);
}

/**
 * Camareira state machine.
 *
 * Valid forward progression:
 *   dirty → will_clean (claim — must be unassigned)
 *   will_clean → cleaning_now
 *   cleaning_now → clean | pending_issue
 *
 * Camareiras CANNOT: skip steps, reset to dirty, or touch another user's request.
 * Admin: unrestricted (may set any status, claim any request, reset to dirty).
 */
function camareiraTransitionAllowed(from: string, to: string): boolean {
  if (to === "will_clean")    return from === "dirty";
  if (to === "cleaning_now")  return from === "will_clean";
  if (to === "clean")         return from === "cleaning_now";
  if (to === "pending_issue") return from === "cleaning_now";
  return false; // camareiras cannot set status="dirty"
}

async function enrichRequest(
  req_: typeof cleaningRequestsTable.$inferSelect,
  flatById: Record<number, any>,
  hasCheckinToday: boolean = false,
) {
  let assignedUsername: string | null = null;
  if (req_.assignedUserId) {
    const [u] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req_.assignedUserId));
    assignedUsername = u?.username ?? null;
  }
  const flat = flatById[req_.flatId];
  return {
    id: req_.id,
    flatId: req_.flatId,
    flatNumber: flat?.number ?? String(req_.flatId),
    requestDate: req_.requestDate,
    source: req_.source,
    status: req_.status,
    assignedUserId: req_.assignedUserId ?? null,
    assignedUsername,
    pendingObservation: req_.pendingObservation ?? null,
    isVacant: req_.isVacant ?? false,
    hasCheckinToday,
    willCleanAt: req_.willCleanAt?.toISOString() ?? null,
    cleaningStartedAt: req_.cleaningStartedAt?.toISOString() ?? null,
    completedAt: req_.completedAt?.toISOString() ?? null,
    createdAt: req_.createdAt.toISOString(),
    updatedAt: req_.updatedAt?.toISOString() ?? req_.createdAt.toISOString(),
  };
}

// GET /cleaning/requests
router.get("/cleaning/requests", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const params = ListCleaningHistoryQueryParams.safeParse(req.query);
  const dateStr = params.success && params.data.date ? params.data.date : today();

  const requests = await db
    .select()
    .from(cleaningRequestsTable)
    .where(
      and(
        gte(cleaningRequestsTable.requestDate, startDate),
        lte(cleaningRequestsTable.requestDate, endDate),
      ),
    )
    .orderBy(cleaningRequestsTable.requestDate);

  if (requests.length === 0) {
    res.json([]);
    return;
  }

  const flatIds = [...new Set(filtered.map((r) => r.flatId))];
  const [flats, checkinReservations] = await Promise.all([
    db.select().from(flatsTable).where(inArray(flatsTable.id, flatIds)),
    // A flat has a same-day checkin if a reservation row exists for that flat on the checkout date
    db.select({ flatId: reservationsTable.flatId })
      .from(reservationsTable)
      .where(and(
        inArray(reservationsTable.flatId, flatIds),
        eq(reservationsTable.reservationDate, dateStr),
      )),
  ]);
  const flatById: Record<number, (typeof flats)[0]> = {};
  for (const f of flats) flatById[f.id] = f;
  const checkinFlatIds = new Set(checkinReservations.map((r) => r.flatId));

  const enriched = await enrichRequest(updated, flatById);
  res.status(201).json(CreateCleaningRequestResponse.parse(enriched));
});

// PATCH /cleaning/assignments/:requestId/status
router.patch("/cleaning/assignments/:requestId/status", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const requestId = Number(req.params.requestId);
  if (isNaN(requestId)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  const { isVacant } = req.body;
  if (typeof isVacant !== "boolean") {
    res.status(400).json({ error: "isVacant deve ser boolean" });
    return;
  }

  const [existing] = await db
    .select()
    .from(cleaningRequestsTable)
    .where(eq(cleaningRequestsTable.id, requestId));
  if (!existing) {
    res.status(404).json({ error: "Solicitação não encontrada" });
    return;
  }

  const [updated] = await db
    .update(cleaningRequestsTable)
    .set(updatePayload as any)
    .where(eq(cleaningRequestsTable.id, params.data.requestId))
    .returning();

  const [flat] = await db
    .select()
    .from(flatsTable)
    .where(eq(flatsTable.id, updated.flatId));
  const flatById: Record<number, (typeof flats)[0]> = {};
  if (flat) flatById[flat.id] = flat;

  // Compute hasCheckinToday for this single request
  const checkinRes = await db
    .select({ flatId: reservationsTable.flatId })
    .from(reservationsTable)
    .where(and(
      eq(reservationsTable.flatId, updated.flatId),
      eq(reservationsTable.reservationDate, updated.requestDate),
    ));
  const hasCheckinToday = checkinRes.length > 0;

  const enriched = await enrichRequest(updated, flatById);
  res.status(201).json(CreateCleaningRequestResponse.parse(enriched));
});

// PATCH /cleaning/assignments/:requestId/status
router.patch("/cleaning/assignments/:requestId/status", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!user || user.role !== "admin") {
    res.status(403).json({ error: "Apenas administradores podem criar solicitações manuais" });
    return;
  }

  const parsed = BatchClaimFlatsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [flat] = await db
    .select()
    .from(flatsTable)
    .where(eq(flatsTable.id, updated.flatId));
  if (!flat) {
    res.status(404).json({ error: "Flat não encontrado" });
    return;
  }

  const [created] = await db
    .insert(cleaningRequestsTable)
    .values({
      flatId: parsed.data.flatId,
      requestDate: parsed.data.requestDate,
      source: "manual",
      status: "dirty",
    })
    .onConflictDoUpdate({
      target: [cleaningRequestsTable.flatId, cleaningRequestsTable.requestDate],
      set: { source: "manual", updatedAt: new Date() },
    })
    .returning();

  const flatById: Record<number, (typeof flats)[0]> = {};
  const enriched = await enrichRequest(updated, flatById);
  res.status(201).json(CreateCleaningRequestResponse.parse(enriched));
});

// PATCH /cleaning/assignments/:requestId/status
router.patch("/cleaning/assignments/:requestId/status", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const params = ListCleaningHistoryQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = BatchClaimFlatsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { status: toStatus, observation } = parsed.data;

  if (toStatus === "pending_issue" && !observation) {
    res.status(400).json({
      error: "Observação obrigatória para status 'Limpo com Pendência'",
    });
    return;
  }

  const [[currentUser], [existing]] = await Promise.all([
    db.select().from(usersTable).where(eq(usersTable.id, userId)),
    db
      .select()
      .from(cleaningRequestsTable)
      .where(eq(cleaningRequestsTable.id, params.data.requestId)),
  ]);

  if (!currentUser) {
    res.status(401).json({ error: "Usuário não encontrado" });
    return;
  }
  if (!existing) {
    res.status(404).json({ error: "Solicitação não encontrada" });
    return;
  }

  const isAdmin = currentUser?.role === "admin";
  const fromStatus = existing.status;
  const now = new Date();

  if (!isAdmin) {
    // Rule 1: cannot touch a request owned by someone else.
    if (existing.assignedUserId != null && existing.assignedUserId !== userId) {
      res.status(403).json({
        error: "Você não pode alterar o status de um flat atribuído a outra camareira",
      });
      return;
    }

    // Rule 2: must follow the strict forward-only state transition sequence.
    if (!camareiraTransitionAllowed(fromStatus, toStatus)) {
      res.status(403).json({
        error: `Transição inválida: '${fromStatus}' → '${toStatus}'. Fluxo obrigatório: sujo → vou limpar → limpando → limpo.`,
      });
      return;
    }

    // Rule 3: progressing past will_clean requires being the assigned camareira.
    if (
      (toStatus === "cleaning_now" || toStatus === "clean" || toStatus === "pending_issue") &&
      existing.assignedUserId !== userId
    ) {
      res.status(403).json({
        error: "Você só pode progredir no status de flats atribuídos a você",
      });
      return;
    }
  }

  // ── Handle will_clean atomically ─────────────────────────────────────────────
  // Use a conditional UPDATE (WHERE status='dirty' AND assignedUserId IS NULL)
  // to prevent two camareiras from simultaneously claiming the same request.
  if (toStatus === "will_clean") {
    const claimWhere = isAdmin
      ? eq(cleaningRequestsTable.id, params.data.requestId)
      : and(
          eq(cleaningRequestsTable.id, params.data.requestId),
          eq(cleaningRequestsTable.status, "dirty"),
          isNull(cleaningRequestsTable.assignedUserId),
        );

    const [claimed] = await db
      .update(cleaningRequestsTable)
      .set({
        status: "will_clean",
        assignedUserId: userId,
        willCleanAt: now,
        updatedAt: now,
      })
      .where(claimWhere!)
      .returning();

    if (!claimed) {
      res.status(409).json({
        error: "Esta solicitação já foi atribuída a outra camareira",
      });
      return;
    }

  const [flat] = await db
    .select()
    .from(flatsTable)
    .where(eq(flatsTable.id, updated.flatId));
  const flatById: Record<number, (typeof flats)[0]> = {};
  if (flat) flatById[flat.id] = flat;

  const enriched = await enrichRequest(updated, flatById);
  res.json(UpdateCleaningStatusResponse.parse(enriched));

  // Fire-and-forget push notification for pending_issue — alert all admins
  if (toStatus === "pending_issue") {
    const flatNumber = flat?.number ?? String(updated.flatId);
    db.select({ token: pushTokensTable.token })
      .from(pushTokensTable)
      .where(eq(pushTokensTable.userId, claimed.assignedUserId!))
      .then((rows) =>
        sendPushNotifications(
          rows.map((r) => r.token),
          "Flat atribuído ✅",
          `Flat ${flatNumber} foi adicionado à sua lista`,
          { requestId: claimed.id, flatId: claimed.flatId, status: "will_clean" },
        ),
      )
      .catch(() => {});

    return;
  }

  // ── Handle dirty (admin reset) ────────────────────────────────────────────────
  // Use explicit sql`null` to guarantee Drizzle sends NULL to the DB for each
  // nullable timestamp/FK column — typed null in a partial update object may be
  // stripped by the ORM before the query is built.
  if (toStatus === "dirty") {
  const [updated] = await db
    .update(cleaningRequestsTable)
    .set(updatePayload as any)
    .where(eq(cleaningRequestsTable.id, params.data.requestId))
    .returning();

  const [flat] = await db
    .select()
    .from(flatsTable)
    .where(eq(flatsTable.id, updated.flatId));
  const flatById: Record<number, (typeof flats)[0]> = {};
  if (flat) flatById[flat.id] = flat;

  const enriched = await enrichRequest(updated, flatById);
    res.json(UpdateCleaningStatusResponse.parse(enriched));
    return;
  }

  // ── Handle cleaning_now / clean / pending_issue ────────────────────────────────
  const updatePayload: Parameters<typeof db.update>[0] extends never
    ? never
    : Record<string, unknown> = {
    status: toStatus,
    updatedAt: now,
  };

  if (toStatus === "cleaning_now") {
    updatePayload.cleaningStartedAt = now;
  } else if (toStatus === "clean" || toStatus === "pending_issue") {
    updatePayload.completedAt = now;
    updatePayload.pendingObservation =
      toStatus === "pending_issue" ? (observation ?? null) : null;
  }

  const [updated] = await db
    .update(cleaningRequestsTable)
    .set(updatePayload as any)
    .where(eq(cleaningRequestsTable.id, params.data.requestId))
    .returning();

  const [flat] = await db
    .select()
    .from(flatsTable)
    .where(eq(flatsTable.id, updated.flatId));
  const flatById: Record<number, (typeof flats)[0]> = {};
  if (flat) flatById[flat.id] = flat;

  const enriched = await enrichRequest(updated, flatById);
  res.json(UpdateCleaningStatusResponse.parse(enriched));

  // Fire-and-forget push notification for pending_issue — alert all admins
  if (toStatus === "pending_issue") {
    const flatNumber = flat?.number ?? String(updated.flatId);
    const issueText = updated.pendingObservation ?? "pendência registrada";
    db.select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.role, "admin"))
      .then(async (admins) => {
        if (admins.length === 0) return;
        const adminIds = admins.map((a) => a.id);
        const tokenRows = await db
          .select({ token: pushTokensTable.token })
          .from(pushTokensTable)
          .where(inArray(pushTokensTable.userId, adminIds));
        return sendPushNotifications(
          tokenRows.map((r) => r.token),
          `⚠️ Flat ${flatNumber}: pendência`,
          issueText,
          { requestId: updated.id, flatId: updated.flatId, status: "pending_issue" },
        );
      })
      .catch(() => {});
  }
});

// POST /cleaning/assignments/batch-claim
// Atomically claims unassigned dirty requests via conditional UPDATE.
// The WHERE clause (status='dirty' AND assignedUserId IS NULL) evaluated
// server-side prevents two concurrent requests from claiming the same flat.
router.post("/cleaning/assignments/batch-claim", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const parsed = BatchClaimFlatsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { requestIds } = parsed.data;
  const now = new Date();
  let claimed = 0;

  for (const reqId of requestIds) {
    // Atomic conditional update: only succeeds if the row is still dirty AND unassigned.
  const result = filtered.map((r) => ({
    id: r.id,
    flatId: r.flatId,
    flatNumber: flatById[r.flatId]?.number ?? String(r.flatId),
    requestDate: r.requestDate,
    status: r.status,
    assignedUserId: r.assignedUserId ?? null,
    assignedUsername: r.assignedUserId
      ? (userById[r.assignedUserId]?.username ?? null)
      : null,
    pendingObservation: r.pendingObservation ?? null,
    completedAt: r.completedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));

    if (result.length > 0) claimed++;
  }

  res.json(BatchClaimFlatsResponse.parse({ claimed, total: requestIds.length }));

  // Fire-and-forget push to confirm the batch assignment to the camareira
  if (claimed > 0) {
    db.select({ token: pushTokensTable.token })
      .from(pushTokensTable)
      .where(eq(pushTokensTable.userId, userId))
      .then((rows) => {
        const body =
          claimed === 1
            ? "1 flat adicionado à sua lista"
            : `${claimed} flats adicionados à sua lista`;
        return sendPushNotifications(
          rows.map((r) => r.token),
          "Flats atribuídos ✅",
          body,
          { claimed, status: "will_clean" },
        );
      })
      .catch(() => {});
  }
});

// GET /cleaning/history
router.get("/cleaning/history", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const params = ListCleaningHistoryQueryParams.safeParse(req.query);
  const startDate =
    params.success && params.data.startDate ? params.data.startDate : startOfMonth();
  const endDate =
    params.success && params.data.endDate ? params.data.endDate : endOfMonth();

  const [currentUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  const isAdmin = currentUser?.role === "admin";

  const filterUserId = !isAdmin
    ? userId
    : params.success && params.data.userId
      ? params.data.userId
      : null;

  const requests = await db
    .select()
    .from(cleaningRequestsTable)
    .where(
      and(
        gte(cleaningRequestsTable.requestDate, startDate),
        lte(cleaningRequestsTable.requestDate, endDate),
      ),
    )
    .orderBy(cleaningRequestsTable.requestDate);

  const filtered = filterUserId
    ? requests.filter((r) => r.assignedUserId === filterUserId)
    : requests;

  if (filtered.length === 0) {
    res.json([]);
    return;
  }

  const flatIds = [...new Set(filtered.map((r) => r.flatId))];
  const flats = await db
    .select()
    .from(flatsTable)
    .where(inArray(flatsTable.id, flatIds));
  const flatById: Record<number, (typeof flats)[0]> = {};
  for (const f of flats) flatById[f.id] = f;

  const userIds = [
    ...new Set(
      filtered.filter((r) => r.assignedUserId).map((r) => r.assignedUserId!),
    ),
  ];
  const users = userIds.length
    ? await db.select().from(usersTable).where(inArray(usersTable.id, userIds))
    : [];
  const userById: Record<number, (typeof users)[0]> = {};
  for (const u of users) userById[u.id] = u;

  const result = filtered.map((r) => ({
    id: r.id,
    flatId: r.flatId,
    flatNumber: flatById[r.flatId]?.number ?? String(r.flatId),
    requestDate: r.requestDate,
    status: r.status,
    assignedUserId: r.assignedUserId ?? null,
    assignedUsername: r.assignedUserId
      ? (userById[r.assignedUserId]?.username ?? null)
      : null,
    pendingObservation: r.pendingObservation ?? null,
    completedAt: r.completedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));

  res.json(ListCleaningHistoryResponse.parse(result));
});

export default router;
