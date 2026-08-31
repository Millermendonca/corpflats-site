import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import {
  LoginBody,
  LoginResponse,
  GetMeResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { username, password } = parsed.data;
  const [user] = await db
    .select()
    .from(usersTable)
    .where(sql`lower(${usersTable.username}) = lower(${username})`);

  const passwordValid = user && await bcrypt.compare(password, user.password);
  if (!passwordValid) {
    res.status(401).json({ error: "Usuário ou senha inválidos" });
    return;
  }

  (req.session as any).userId = user.id;
  res.json(LoginResponse.parse({ id: user.id, username: user.username, role: user.role }));
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

router.get("/auth/me", async (req, res): Promise<void> => {
  const userId = (req.session as any).userId;
  if (!userId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) {
    res.status(401).json({ error: "Usuário não encontrado" });
    return;
  }

  res.json(GetMeResponse.parse({ id: user.id, username: user.username, role: user.role }));
});

export default router;
