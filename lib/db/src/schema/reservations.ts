import { pgTable, text, serial, integer, date, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// One row per (flat, date) pair — cell value from Excel
export const reservationsTable = pgTable(
  "reservations",
  {
    id: serial("id").primaryKey(),
    flatId: integer("flat_id").notNull(),
    reservationDate: date("reservation_date", { mode: "string" }).notNull(),
    guestInfo: text("guest_info"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [unique("uniq_flat_date").on(t.flatId, t.reservationDate)]
);

export const insertReservationSchema = createInsertSchema(reservationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertReservation = z.infer<typeof insertReservationSchema>;
export type Reservation = typeof reservationsTable.$inferSelect;
