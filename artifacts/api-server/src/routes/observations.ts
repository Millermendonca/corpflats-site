import { Router, type IRouter } from "express";
import { db, flatObservationsTable, flatsTable, usersTable, cleaningRequestsTable } from "@workspace/db";
import { eq, and, gte, lte, inArray, desc } from "drizzle-orm";
import {
  ListObservationsQueryParams,
  CreateObservationBody,
  ResolveObservationBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

function requireAuth(req: any, res: any): number | null {
  const userId = req.session?.userId;
  if (!userId) { res.status(401).json({ error: "Não autenticado" }); return null; }
  return userId;
}

/**
 * Derive the set of flat IDs a user is authorised to access.
 * - Admins: unrestricted (returns null).
 * - Camareiras: strictly the flats to which they have been assigned via
 *   cleaning_requests. Observation authorship is intentionally excluded —
 *   including it would allow an attacker to bootstrap access to any flat by
 *   posting an observation on it first.
 */
async function getAuthorizedFlatIds(userId: number): Promise<{ role: string; allowedFlatIds: number[] | null }> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) return { role: "camareira", allowedFlatIds: [] };

  if (user.role === "admin") {
    return { role: "admin", allowedFlatIds: null };
  }

  // Camareiras: only flats they have been assigned to clean
  const assignments = await db
    .selectDistinct({ flatId: cleaningRequestsTable.flatId })
    .from(cleaningRequestsTable)
    .where(eq(cleaningRequestsTable.assignedUserId, userId));

  const flatIds = assignments.map((a) => a.flatId);
  return { role: "camareira", allowedFlatIds: flatIds };
}

async function enrichObservation(obs: typeof flatObservationsTable.$inferSelect) {
  const [flat] = await db.select().from(flatsTable).where(eq(flatsTable.id, obs.flatId));
  const [author] = await db.select().from(usersTable).where(eq(usersTable.id, obs.authorUserId));
  let resolvedByUsername: string | null = null;
  if (obs.resolvedByUserId) {
    const [resolver] = await db.select().from(usersTable).where(eq(usersTable.id, obs.resolvedByUserId));
    resolvedByUsername = resolver?.username ?? null;
  }
  return {
    id: obs.id,
    flatId: obs.flatId,
    flatNumber: flat?.number ?? "?",
    authorUserId: obs.authorUserId,
    authorUsername: author?.username ?? "?",
    category: obs.category,
    text: obs.text,
    status: obs.status,
    resolvedAt: obs.resolvedAt?.toISOString() ?? null,
    resolvedByUserId: obs.resolvedByUserId ?? null,
    resolvedByUsername,
    resolvedNote: obs.resolvedNote ?? null,
    createdAt: obs.createdAt.toISOString(),
    updatedAt: obs.updatedAt?.toISOString() ?? obs.createdAt.toISOString(),
  };
}

// GET /observations
router.get("/observations", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { role, allowedFlatIds } = await getAuthorizedFlatIds(userId);
  const params = ListObservationsQueryParams.safeParse(req.query);
  const p = params.success ? params.data : {};

  const conditions: any[] = [];

  // Enforce flat-level access control for camareiras
  if (role === "camareira") {
    if (!allowedFlatIds || allowedFlatIds.length === 0) {
      res.json([]);
      return;
    }
    conditions.push(inArray(flatObservationsTable.flatId, allowedFlatIds));
  }

  // Additional query filters (layered on top of access control)
  if (p.flatId) {
    if (role === "camareira" && allowedFlatIds && !allowedFlatIds.includes(p.flatId)) {
      res.status(403).json({ error: "Acesso negado a este flat" });
      return;
    }
    conditions.push(eq(flatObservationsTable.flatId, p.flatId));
  }
  if (p.category) conditions.push(eq(flatObservationsTable.category, p.category));
  if (p.status) conditions.push(eq(flatObservationsTable.status, p.status));
  if (p.startDate) conditions.push(gte(flatObservationsTable.createdAt, new Date(p.startDate)));
  if (p.endDate) {
    const end = new Date(p.endDate);
    end.setDate(end.getDate() + 1);
    conditions.push(lte(flatObservationsTable.createdAt, end));
  }

  const rows = conditions.length > 0
    ? await db.select().from(flatObservationsTable).where(and(...conditions)).orderBy(desc(flatObservationsTable.createdAt))
    : await db.select().from(flatObservationsTable).orderBy(desc(flatObservationsTable.createdAt));

  const enriched = await Promise.all(rows.map(enrichObservation));
  res.json(enriched);
});

// POST /observations
router.post("/observations", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const parsed = CreateObservationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { flatId, category, text } = parsed.data;

  // Verify flat exists
  const [flat] = await db.select().from(flatsTable).where(eq(flatsTable.id, flatId));
  if (!flat) { res.status(404).json({ error: "Flat não encontrado" }); return; }

  // Enforce the same assignment-based scope on creation as on listing
  const { role, allowedFlatIds } = await getAuthorizedFlatIds(userId);
  if (role === "camareira") {
    if (!allowedFlatIds || !allowedFlatIds.includes(flatId)) {
      res.status(403).json({ error: "Você não está atribuída a este flat" });
      return;
    }
  }

  const [obs] = await db.insert(flatObservationsTable).values({
    flatId, authorUserId: userId, category, text,
  }).returning();

  res.status(201).json(await enrichObservation(obs));
});

// PATCH /observations/:id/resolve
router.patch("/observations/:id/resolve", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || user.role !== "admin") { res.status(403).json({ error: "Apenas administradores podem resolver observações" }); return; }

  const id = parseInt(req.params.id);
  const [obs] = await db.select().from(flatObservationsTable).where(eq(flatObservationsTable.id, id));
  if (!obs) { res.status(404).json({ error: "Observação não encontrada" }); return; }

  const parsed = ResolveObservationBody.safeParse(req.body ?? {});
  const resolvedNote = parsed.success ? (parsed.data.resolvedNote ?? null) : null;

  const [updated] = await db.update(flatObservationsTable).set({
    status: "resolvida",
    resolvedAt: new Date(),
    resolvedByUserId: userId,
    resolvedNote,
  }).where(eq(flatObservationsTable.id, id)).returning();

  res.json(await enrichObservation(updated));
});

export default router;
