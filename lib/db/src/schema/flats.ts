import { pgTable, text, serial, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const flatsTable = pgTable("flats", {
  id: serial("id").primaryKey(),
  number: text("number").notNull().unique(),
  isOccupied: boolean("is_occupied").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertFlatSchema = createInsertSchema(flatsTable).omit({ id: true, updatedAt: true });
export type InsertFlat = z.infer<typeof insertFlatSchema>;
export type Flat = typeof flatsTable.$inferSelect;
