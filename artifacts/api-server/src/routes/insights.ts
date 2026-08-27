import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { cartEventsTable } from "@workspace/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/cart", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    if (!session) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const shop = session.shop;

    const [totalEvents] = await db
      .select({ count: sql<number>`count(*)` })
      .from(cartEventsTable)
      .where(eq(cartEventsTable.shop, shop));

    const breakdown = await db
      .select({
        eventType: cartEventsTable.eventType,
        count: sql<number>`count(*)`,
      })
      .from(cartEventsTable)
      .where(eq(cartEventsTable.shop, shop))
      .groupBy(cartEventsTable.eventType);

    const recentEvents = await db
      .select()
      .from(cartEventsTable)
      .where(eq(cartEventsTable.shop, shop))
      .orderBy(desc(cartEventsTable.createdAt))
      .limit(10);

    return res.json({
      total: totalEvents?.count || 0,
      breakdown,
      recent: recentEvents,
    });
  } catch (error) {
    logger.error(error, "Failed to fetch cart insights");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
