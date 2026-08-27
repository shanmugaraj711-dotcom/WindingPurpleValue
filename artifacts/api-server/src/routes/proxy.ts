import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { cartEventsTable } from "@workspace/db/schema";
import { verifyAppProxySignature } from "../middlewares/proxy";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// App Proxy routes are automatically verified for signature
router.use(verifyAppProxySignature);

router.post("/events", async (req, res) => {
  try {
    const { shop } = req.query;
    const { event_type, cart_token, payload } = req.body;

    if (!shop || typeof shop !== "string") {
      return res.status(400).json({ error: "Missing shop parameter" });
    }

    if (!event_type || !payload) {
      return res.status(400).json({ error: "Missing event_type or payload" });
    }

    await db.insert(cartEventsTable).values({
      shop,
      eventType: event_type,
      cartToken: cart_token,
      payload,
    });

    return res.json({ success: true });
  } catch (error) {
    logger.error(error, "Failed to ingest cart event");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
