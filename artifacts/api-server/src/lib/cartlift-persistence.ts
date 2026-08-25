import { eq } from "drizzle-orm";
import { db, cartliftEventsTable, cartliftSettingsTable } from "@winding-purple-value/db";
import type { CartLiftEvent } from "./analytics";
import type { CartLiftMerchantSettings } from "./merchant-settings";

export async function getMerchantSettings(shop: string): Promise<CartLiftMerchantSettings | undefined> {
  const rows = await db.select().from(cartliftSettingsTable).where(eq(cartliftSettingsTable.shop, shop)).limit(1);
  return rows[0] as CartLiftMerchantSettings | undefined;
}

export async function upsertMerchantSettings(settings: CartLiftMerchantSettings) {
  const [row] = await db.insert(cartliftSettingsTable).values(settings).onConflictDoUpdate({
    target: cartliftSettingsTable.shop,
    set: {
      freeShippingThresholdCents: settings.freeShippingThresholdCents,
      recommendationMode: settings.recommendationMode,
      recommendationProductId: settings.recommendationProductId,
      enabled: settings.enabled,
      updatedAt: new Date(),
    },
  }).returning();
  return row;
}

export async function persistEvent(event: CartLiftEvent) {
  const [row] = await db.insert(cartliftEventsTable).values({
    id: `${event.shop}:${event.createdAt}:${crypto.randomUUID()}`,
    shop: event.shop,
    type: event.type,
    sessionId: event.sessionId,
    cartToken: event.cartToken,
    revenueCents: event.revenueCents,
    createdAt: new Date(event.createdAt),
  }).returning();
  return row;
}

export async function getMerchantEvents(shop: string) {
  return db.select().from(cartliftEventsTable).where(eq(cartliftEventsTable.shop, shop));
}
