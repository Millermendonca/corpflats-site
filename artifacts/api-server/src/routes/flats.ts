import { Router, type IRouter } from "express";
import { db, flatsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  ListFlatsResponse,
  GetFlatParams,
  GetFlatResponse,
  UpdateFlatParams,
  UpdateFlatBody,
  UpdateFlatResponse,
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

router.get("/flats", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const flats = await db.select().from(flatsTable).orderBy(flatsTable.number);
  res.json(ListFlatsResponse.parse(
    flats.map((f) => ({
      id: f.id,
      number: f.number,
      isOccupied: f.isOccupied,
      updatedAt: f.updatedAt?.toISOString() ?? "",
    }))
  ));
});

router.get("/flats/:id", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const params = GetFlatParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [flat] = await db
    .select()
    .from(flatsTable)
    .where(eq(flatsTable.id, params.data.id));

  if (!flat) {
    res.status(404).json({ error: "Flat não encontrado" });
    return;
  }

  res.json(GetFlatResponse.parse({
    id: flat.id,
    number: flat.number,
    isOccupied: flat.isOccupied,
    updatedAt: flat.updatedAt?.toISOString() ?? "",
  }));
});

router.patch("/flats/:id", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  // Role policy: both camareiras and admin can toggle occupancy.
  // The isOccupied flag is a manual signal meaning "guest announced checkout → flat is now vacant".
  // Camareiras use this in real-time as they learn about checkouts; admin also has full access.
  // No role restriction applied here — any authenticated user may update occupancy.

  const params = UpdateFlatParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateFlatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [updated] = await db
    .update(flatsTable)
    .set({ isOccupied: parsed.data.isOccupied })
    .where(eq(flatsTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Flat não encontrado" });
    return;
  }

  res.json(UpdateFlatResponse.parse({
    id: updated.id,
    number: updated.number,
    isOccupied: updated.isOccupied,
    updatedAt: updated.updatedAt?.toISOString() ?? "",
  }));
});

export default router;
