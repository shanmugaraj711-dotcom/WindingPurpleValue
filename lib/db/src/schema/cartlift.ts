import { pgTable, text, boolean, integer, timestamp, varchar } from "drizzle-orm/pg-core";

export const cartliftSettingsTable = pgTable("cartlift_settings", {
  shop: varchar("shop", { length: 255 }).primaryKey(),
  freeShippingThresholdCents: integer("free_shipping_threshold_cents").notNull().default(0),
  recommendationMode: varchar("recommendation_mode", { length: 20 }).notNull().default("automatic"),
  recommendationProductId: varchar("recommendation_product_id", { length: 255 }),
  enabled: boolean("enabled").notNull().default(false),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const cartliftEventsTable = pgTable("cartlift_events", {
  id: varchar("id", { length: 64 }).primaryKey(),
  shop: varchar("shop", { length: 255 }).notNull(),
  type: varchar("type", { length: 40 }).notNull(),
  sessionId: varchar("session_id", { length: 255 }),
  cartToken: varchar("cart_token", { length: 255 }),
  revenueCents: integer("revenue_cents"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
