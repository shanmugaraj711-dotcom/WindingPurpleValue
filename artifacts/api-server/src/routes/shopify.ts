import { Router } from "express";
import { exchangeIdTokenForOfflineToken, getShopFromIdToken } from "../lib/shopify-auth";
import { getShopIdentity } from "../lib/shopify-admin";

const router = Router();

router.post("/shopify/exchange/offline", async (req, res) => {
  const idToken = req.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (!idToken) return res.status(401).json({ error: "Missing Shopify ID token." });

  try {
    const result = await exchangeIdTokenForOfflineToken(idToken);
    return res.json({ scope: result.scope });
  } catch (error) {
    res.setHeader("X-Shopify-Retry-Invalid-Session-Request", "1");
    return res.status(401).json({
      error: error instanceof Error ? error.message : "Shopify authentication failed.",
    });
  }
});

router.get("/shopify/shop", async (req, res) => {
  const idToken = req.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (!idToken) return res.status(401).json({ error: "Missing Shopify ID token." });

  try {
    const { shop } = getShopFromIdToken(idToken);
    await exchangeIdTokenForOfflineToken(idToken);
    return res.json(await getShopIdentity(shop));
  } catch (error) {
    res.setHeader("X-Shopify-Retry-Invalid-Session-Request", "1");
    return res.status(401).json({
      error: error instanceof Error ? error.message : "Shopify authentication failed.",
    });
  }
});

export default router;
