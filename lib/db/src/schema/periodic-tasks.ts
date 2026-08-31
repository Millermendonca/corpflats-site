import { pgTable, text, serial, integer, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/** Definition of a recurring maintenance task */
export const periodicTasksTable = pgTable("periodic_tasks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  periodDays: integer("period_days").notNull().default(7), // repeat every N days
  isActive: boolean("is_active").notNull().default(true),
  createdByUserId: integer("created_by_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

/** Many-to-many: which flats a task applies to */
export const periodicTaskFlatsTable = pgTable(
  "periodic_task_flats",
  {
    id: serial("id").primaryKey(),
    periodicTaskId: integer("periodic_task_id").notNull(),
    flatId: integer("flat_id").notNull(),
  },
  (t) => [unique("uniq_task_flat").on(t.periodicTaskId, t.flatId)]
);

/** Log of each execution of a periodic task for a specific flat */
export const periodicTaskExecutionsTable = pgTable("periodic_task_executions", {
  id: serial("id").primaryKey(),
  periodicTaskId: integer("periodic_task_id").notNull(),
  flatId: integer("flat_id").notNull(),
  executedByUserId: integer("executed_by_user_id").notNull(),
  executedAt: timestamp("executed_at", { withTimezone: true }).notNull().defaultNow(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPeriodicTaskSchema = createInsertSchema(periodicTasksTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertPeriodicTask = z.infer<typeof insertPeriodicTaskSchema>;
export type PeriodicTask = typeof periodicTasksTable.$inferSelect;
export type PeriodicTaskFlat = typeof periodicTaskFlatsTable.$inferSelect;
export type PeriodicTaskExecution = typeof periodicTaskExecutionsTable.$inferSelect;
