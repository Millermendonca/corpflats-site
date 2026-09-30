import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";

/**
 * Shopping list items — shared across all users.
 * sortOrder: lower = higher in list (manual drag-drop order).
 */
export const shoppingListTable = pgTable("shopping_list", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  quantity: text("quantity"),
  category: text("category").notNull().default("Limpeza"),
  notes: text("notes"),
  completed: boolean("completed").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdByUserId: integer("created_by_user_id").notNull(),
  createdByName: text("created_by_name").notNull(),
  createdByRole: text("created_by_role").notNull().default("camareira"),
  completedByUserId: integer("completed_by_user_id"),
  completedByName: text("completed_by_name"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Catalog of known items — grows automatically as new items are added to the list.
 * Used for autocomplete suggestions.
 */
export const shoppingCatalogTable = pgTable("shopping_catalog", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  useCount: integer("use_count").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ShoppingListItem = typeof shoppingListTable.$inferSelect;
export type ShoppingCatalogEntry = typeof shoppingCatalogTable.$inferSelect;
