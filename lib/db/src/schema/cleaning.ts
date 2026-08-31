import { pgTable, text, serial, integer, date, timestamp, unique, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const cleaningRequestsTable = pgTable(
  "cleaning_requests",
  {
    id: serial("id").primaryKey(),
    flatId: integer("flat_id").notNull(),
    requestDate: date("request_date", { mode: "string" }).notNull(),
    source: text("source").notNull().default("checkout"), // "checkout" | "manual"
    status: text("status").notNull().default("dirty"),    // dirty | will_clean | cleaning_now | pending_issue | clean
    assignedUserId: integer("assigned_user_id"),          // nullable — who claimed it
    pendingObservation: text("pending_observation"),
    isVacant: boolean("is_vacant").notNull().default(false), // room is already empty (early checkout)
    willCleanAt: timestamp("will_clean_at", { withTimezone: true }),
    cleaningStartedAt: timestamp("cleaning_started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [unique("uniq_flat_request_date").on(t.flatId, t.requestDate)]
);

export const insertCleaningRequestSchema = createInsertSchema(cleaningRequestsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCleaningRequest = z.infer<typeof insertCleaningRequestSchema>;
export type CleaningRequest = typeof cleaningRequestsTable.$inferSelect;
