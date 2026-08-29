import { pgTable, text, boolean, timestamp, varchar } from "drizzle-orm/pg-core";

export const shopifySessionsTable = pgTable("shopify_sessions", {
  id: varchar("id", { length: 255 }).primaryKey(),
  shop: varchar("shop", { length: 255 }).notNull(),
  state: varchar("state", { length: 255 }).notNull(),
  isOnline: boolean("is_online").notNull().default(false),
  scope: text("scope"),
  expires: timestamp("expires"),
  accessToken: varchar("access_token", { length: 255 }).notNull(),
  userId: varchar("user_id", { length: 255 }),
});

export type ShopifySession = typeof shopifySessionsTable.$inferSelect;
export type InsertShopifySession = typeof shopifySessionsTable.$inferInsert;
