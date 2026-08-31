import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const pushTokensTable = pgTable("push_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPushTokenSchema = createInsertSchema(pushTokensTable).omit({
  id: true,
  createdAt: true,
});

export type PushToken = typeof pushTokensTable.$inferSelect;
export type InsertPushToken = typeof pushTokensTable.$inferInsert;
