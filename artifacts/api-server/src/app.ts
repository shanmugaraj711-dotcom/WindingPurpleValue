import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import shopify from "./lib/shopify";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());

// Shopify Authentication Routes
app.get(shopify.config.auth.path, shopify.auth.begin());
app.get(
  shopify.config.auth.callbackPath,
  shopify.auth.callback(),
  shopify.redirectToShopifyOrAppRoot(),
);
app.post(
  shopify.config.webhooks.path,
  shopify.processWebhooks({ webhookHandlers: {} as any }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Public routes
app.use("/api/healthz", (req, res, next) => {
  // Pass to the router but avoid the auth middleware
  router(req, res, next);
});

// Protect all other /api routes
app.use("/api/*", (req, res, next) => {
  if (req.baseUrl === "/api/healthz" || req.path === "/healthz") {
    return next();
  }
  shopify.validateAuthenticatedSession()(req, res, next);
});

app.use("/api", router);

export default app;
