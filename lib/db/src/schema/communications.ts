import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const reservationCommunicationsTable = pgTable("reservation_communications", {
  id: text("id").primaryKey(),
  reservationId: text("reservation_id").notNull(),
  type: text("type").notNull().default("email"), // email | whatsapp
  direction: text("direction").notNull().default("outbound"), // outbound | inbound
  recipient: text("recipient").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("pending"), // sent | failed | pending | received
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertReservationCommunicationSchema = createInsertSchema(reservationCommunicationsTable);
export type InsertReservationCommunication = z.infer<typeof insertReservationCommunicationSchema>;
export type ReservationCommunication = typeof reservationCommunicationsTable.$inferSelect;
