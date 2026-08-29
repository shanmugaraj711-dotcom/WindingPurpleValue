import "@shopify/shopify-api/adapters/node";
import { ApiVersion } from "@shopify/shopify-api";
import { shopifyApp } from "@shopify/shopify-app-express";
import { DrizzleSessionStorage } from "./session-storage";
import "dotenv/config";

const shopify = shopifyApp({
  api: {
    apiVersion: "2026-07" as ApiVersion,
    restResources: undefined,
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecretKey: process.env.SHOPIFY_API_SECRET!,
    scopes: process.env.SCOPES?.split(",").map((scope) => scope.trim()).filter(Boolean),
    hostName: process.env.SHOPIFY_APP_URL?.replace(/https?:\/\//, ""),
  },
  auth: {
    path: "/api/auth",
    callbackPath: "/api/auth/callback",
  },
  webhooks: {
    path: "/api/webhooks",
  },
  sessionStorage: new DrizzleSessionStorage(),
});

export default shopify;
