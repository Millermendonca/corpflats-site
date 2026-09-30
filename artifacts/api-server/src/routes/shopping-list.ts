import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { shoppingListTable, shoppingCatalogTable, usersTable } from "@workspace/db";
import { eq, asc, desc, sql } from "drizzle-orm";

const router: IRouter = Router();

const INITIAL_CATALOG = [
  "Papel higiênico", "Cif", "X14", "Saco Lixo", "Vassoura", "Pá",
  "Esponja", "Bombril", "Limpa inox", "Detergente", "Cloro", "Alcool",
  "Cheirinho", "Pano de chão", "Lâmpada Banheiro Pequena",
  "Lâmpada banheiro grande", "Lâmpada teto", "Lâmpada abajur",
];

function requireAuth(req: any, res: any): number | null {
  const userId = req.session?.userId;
  if (!userId) { res.status(401).json({ error: "Não autenticado" }); return null; }
  return userId;
}

function mapItem(row: typeof shoppingListTable.$inferSelect) {
  return {
    id: String(row.id),
    title: row.title,
    quantity: row.quantity ?? "",
    category: row.category,
    notes: row.notes ?? "",
    completed: row.completed,
    sortOrder: row.sortOrder,
    createdBy: {
      id: row.createdByUserId,
      name: row.createdByName,
      role: row.createdByRole,
    },
    createdAt: row.createdAt.toISOString(),
    completedBy: row.completedByUserId
      ? { id: row.completedByUserId, name: row.completedByName ?? "Admin", role: "admin" }
      : null,
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

/** Upsert an item name into the catalog, incrementing use_count */
async function upsertCatalog(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;
  await db
    .insert(shoppingCatalogTable)
    .values({ name: trimmed, useCount: 1 })
    .onConflictDoUpdate({
      target: shoppingCatalogTable.name,
      set: {
        useCount: sql`${shoppingCatalogTable.useCount} + 1`,
        updatedAt: new Date(),
      },
    });
}

// GET /shopping-list
router.get("/shopping-list", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  // Ensure initial catalog entries exist on first access
  for (const name of INITIAL_CATALOG) {
    await db
      .insert(shoppingCatalogTable)
      .values({ name, useCount: 0 })
      .onConflictDoNothing();
  }

  const rows = await db
    .select()
    .from(shoppingListTable)
    .orderBy(asc(shoppingListTable.sortOrder), desc(shoppingListTable.createdAt));

  res.json(rows.map(mapItem));
});

// GET /shopping-list/catalog — returns all known item names sorted by usage
router.get("/shopping-list/catalog", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const rows = await db
    .select()
    .from(shoppingCatalogTable)
    .orderBy(desc(shoppingCatalogTable.useCount), asc(shoppingCatalogTable.name));

  res.json(rows.map((r) => ({ id: r.id, name: r.name, useCount: r.useCount })));
});

// POST /shopping-list
router.post("/shopping-list", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { title, quantity, category, notes } = req.body ?? {};
  if (!title?.trim()) { res.status(400).json({ error: "Título obrigatório" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(401).json({ error: "Usuário não encontrado" }); return; }

  // Compute sort_order: put new items at top (min - 1)
  const [minRow] = await db
    .select({ minOrder: sql<number>`COALESCE(MIN(sort_order), 0)` })
    .from(shoppingListTable);
  const sortOrder = (minRow?.minOrder ?? 0) - 1;

  const [row] = await db
    .insert(shoppingListTable)
    .values({
      title: title.trim(),
      quantity: quantity?.trim() || null,
      category: category || "Limpeza",
      notes: notes?.trim() || null,
      completed: false,
      sortOrder,
      createdByUserId: userId,
      createdByName: user.username,
      createdByRole: user.role,
    })
    .returning();

  // Upsert into catalog so this item appears in autocomplete
  await upsertCatalog(title.trim());

  res.status(201).json(mapItem(row));
});

// PATCH /shopping-list/:id/toggle
router.patch("/shopping-list/:id/toggle", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const [existing] = await db.select().from(shoppingListTable).where(eq(shoppingListTable.id, id));
  if (!existing) { res.status(404).json({ error: "Item não encontrado" }); return; }

  const nextCompleted = req.body?.completed !== undefined ? Boolean(req.body.completed) : !existing.completed;

  const [updated] = await db
    .update(shoppingListTable)
    .set({
      completed: nextCompleted,
      completedAt: nextCompleted ? new Date() : null,
      completedByUserId: nextCompleted ? userId : null,
      completedByName: nextCompleted ? (user?.username || "Admin") : null,
      updatedAt: new Date(),
    })
    .where(eq(shoppingListTable.id, id))
    .returning();

  res.json(mapItem(updated));
});

// PATCH /shopping-list/reorder — receive array of { id, sortOrder }
// IMPORTANT: must be before /:id to avoid Express treating "reorder" as an id
router.patch("/shopping-list/reorder", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const items: { id: string; sortOrder: number }[] = req.body?.items ?? [];
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: "items[] obrigatório" });
    return;
  }

  await Promise.all(
    items.map(({ id, sortOrder }) =>
      db
        .update(shoppingListTable)
        .set({ sortOrder, updatedAt: new Date() })
        .where(eq(shoppingListTable.id, parseInt(id)))
    )
  );

  res.json({ ok: true });
});

// PATCH /shopping-list/:id — edit title/quantity/notes/category
router.patch("/shopping-list/:id", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const [existing] = await db.select().from(shoppingListTable).where(eq(shoppingListTable.id, id));
  if (!existing) { res.status(404).json({ error: "Item não encontrado" }); return; }

  const { title, quantity, category, notes } = req.body ?? {};

  if (title !== undefined && !title?.trim()) {
    res.status(400).json({ error: "Título não pode ficar vazio" });
    return;
  }

  const updates: Partial<typeof shoppingListTable.$inferInsert> = { updatedAt: new Date() };
  if (title !== undefined) updates.title = title.trim();
  if (quantity !== undefined) updates.quantity = quantity?.trim() || null;
  if (category !== undefined) updates.category = category;
  if (notes !== undefined) updates.notes = notes?.trim() || null;

  const [updated] = await db
    .update(shoppingListTable)
    .set(updates)
    .where(eq(shoppingListTable.id, id))
    .returning();

  // If title changed, also upsert in catalog
  if (title !== undefined && title.trim()) {
    await upsertCatalog(title.trim());
  }

  res.json(mapItem(updated));
});

// DELETE /shopping-list/:id
router.delete("/shopping-list/:id", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  await db.delete(shoppingListTable).where(eq(shoppingListTable.id, id));
  res.json({ ok: true });
});

export default router;
