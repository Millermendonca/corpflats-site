import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Flat observations / maintenance notes.
 * Categories: "defeito" | "manutencao" | "outro"
 * Status: "aberta" | "resolvida"
 */
export const flatObservationsTable = pgTable("flat_observations", {
  id: serial("id").primaryKey(),
  flatId: integer("flat_id").notNull(),
  authorUserId: integer("author_user_id").notNull(),
  category: text("category").notNull().default("outro"), // "defeito" | "manutencao" | "outro"
  text: text("text").notNull(),
  status: text("status").notNull().default("aberta"),    // "aberta" | "resolvida"
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedByUserId: integer("resolved_by_user_id"),
  resolvedNote: text("resolved_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertFlatObservationSchema = createInsertSchema(flatObservationsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertFlatObservation = z.infer<typeof insertFlatObservationSchema>;
export type FlatObservation = typeof flatObservationsTable.$inferSelect;
