import { Router, type IRouter } from "express";
import { db, pushTokensTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();

function requireAuth(req: any, res: any): number | null {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Não autenticado" });
    return null;
  }
  return userId;
}

// POST /push-tokens
// Registers (or refreshes) a push token for the authenticated user.
router.post("/push-tokens", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { token } = req.body;
  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "Campo 'token' é obrigatório" });
    return;
  }

  if (!token.startsWith("ExponentPushToken[") && !token.startsWith("ExpoPushToken[")) {
    res.status(400).json({ error: "Token inválido — deve ser um Expo Push Token" });
    return;
  }

  // Upsert: if the token already exists for this user, keep it.
  // If it belonged to another user (device transfer), update the userId.
  await db
    .insert(pushTokensTable)
    .values({ userId, token })
    .onConflictDoUpdate({
      target: pushTokensTable.token,
      set: { userId },
    });

  res.json({ ok: true });
});

// DELETE /push-tokens
// Removes all push tokens for the authenticated user (called on logout).
router.delete("/push-tokens", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { token } = req.body;

  if (token && typeof token === "string") {
    // Remove a specific token
    await db
      .delete(pushTokensTable)
      .where(and(eq(pushTokensTable.userId, userId), eq(pushTokensTable.token, token)));
  } else {
    // Remove all tokens for this user
    await db.delete(pushTokensTable).where(eq(pushTokensTable.userId, userId));
  }

  res.json({ ok: true });
});

export default router;
