type AnalyticsEnv = {
  CARTLIFT_ANALYTICS_KV?: KVNamespace;
  SHOPIFY_API_KEY: string;
  SHOPIFY_API_SECRET: string;
};

type Claims = { aud?: string; dest?: string; exp?: number; nbf?: number; iss?: string };
type DeliveryDiagnostics = {
  counts?: Record<string, number>;
  lastStage?: string;
  lastStatus?: string;
  lastUpdatedAt?: number;
  lastEvent?: string;
  lastError?: string;
};
type AnalyticsRecord = {
  events?: Record<string, number>;
  total?: number;
  sessions?: number;
  eventIds?: string[];
  lastEventAt?: number;
};
const INVALID_ID_TOKEN = "INVALID_ID_TOKEN";

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
function decodeJson<T>(value: string): T { return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T; }
function verifyIdToken(token: string, env: AnalyticsEnv): Claims {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error(INVALID_ID_TOKEN);
  const claims = decodeJson<Claims>(parts[1]);
  const now = Math.floor(Date.now() / 1000);
  if (!claims.dest || claims.aud !== env.SHOPIFY_API_KEY || !claims.exp || claims.exp <= now) throw new Error(INVALID_ID_TOKEN);
  const destination = new URL(claims.dest);
  if (destination.protocol !== "https:" || !destination.hostname.endsWith(".myshopify.com")) throw new Error(INVALID_ID_TOKEN);
  return claims;
}
const CORS_HEADERS = {
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};
function response(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: CORS_HEADERS });
}
function rate(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}
function buildInsights(events: Record<string, number>, sessions: number) {
  const pageViews = events.page_viewed ?? 0;
  const productViews = events.product_viewed ?? 0;
  const addToCarts = events.product_added_to_cart ?? 0;
  const cartViews = events.cart_viewed ?? 0;
  const checkoutStarts = events.checkout_started ?? 0;
  const checkoutCompletions = events.checkout_completed ?? 0;
  const removals = events.product_removed_from_cart ?? 0;

  return {
    funnel: { pageViews, productViews, addToCarts, cartViews, checkoutStarts, checkoutCompletions },
    rates: {
      productViewRate: rate(productViews, pageViews),
      addToCartRate: rate(addToCarts, productViews),
      cartViewRate: rate(cartViews, addToCarts),
      checkoutStartRate: rate(checkoutStarts, cartViews),
      checkoutCompletionRate: rate(checkoutCompletions, checkoutStarts),
      sessionCheckoutRate: rate(checkoutCompletions, sessions),
      removalRate: rate(removals, addToCarts),
    },
    sessions,
  };
}
function updateDelivery(current: DeliveryDiagnostics | undefined, stage: string, status: "ok" | "error", event?: string, error?: string): DeliveryDiagnostics {
  const counts = { ...(current?.counts ?? {}) };
  counts[stage] = (counts[stage] ?? 0) + 1;
  return { counts, lastStage: stage, lastStatus: status, lastUpdatedAt: Date.now(), lastEvent: event || current?.lastEvent, lastError: error || undefined };
}

// A 204 response MUST have a null body. Response.json(null, { status: 204 })
// still creates a JSON body and Cloudflare Workers rejects it.
export const onRequestOptions: PagesFunction<AnalyticsEnv> = async () =>
  new Response(null, { status: 204, headers: CORS_HEADERS });

export const onRequestPost: PagesFunction<AnalyticsEnv> = async ({ request, env }) => {
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return response(400, { error: "Invalid JSON.", diagnosticStage: "endpoint_rejected" }); }

  const diagnostic = body.diagnostic as Record<string, unknown> | undefined;
  const diagnosticStage = typeof diagnostic?.stage === "string" ? diagnostic.stage.slice(0, 60) : "";
  const diagnosticStatus = diagnostic?.status === "error" ? "error" : "ok";
  const diagnosticError = typeof diagnostic?.error === "string" ? diagnostic.error.slice(0, 200) : undefined;
  const diagnosticEvent = typeof diagnostic?.event === "string" ? diagnostic.event.slice(0, 80) : undefined;
  const diagnosticShop = typeof diagnostic?.shop === "string" ? diagnostic.shop : typeof body.shop === "string" ? body.shop : "";

  if (diagnosticStage) {
    if (!diagnosticShop || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(diagnosticShop)) return response(400, { error: "Invalid shop.", diagnosticStage: "endpoint_rejected" });
    if (!env.CARTLIFT_ANALYTICS_KV) return response(202, { ok: true, persisted: false, diagnostic: true });
    try {
      const key = `analytics:delivery:${diagnosticShop}`;
      const current = await env.CARTLIFT_ANALYTICS_KV.get(key, "json") as DeliveryDiagnostics | null;
      const delivery = updateDelivery(current ?? undefined, diagnosticStage, diagnosticStatus, diagnosticEvent, diagnosticError);
      await env.CARTLIFT_ANALYTICS_KV.put(key, JSON.stringify(delivery), { expirationTtl: 60 * 60 * 24 * 180 });
      return response(202, { ok: true, persisted: true, diagnostic: true });
    } catch { return response(503, { error: "Analytics storage failed.", diagnosticStage: "kv_persist_failed" }); }
  }

  const event = typeof body.event === "string" ? body.event.slice(0, 80) : "unknown";
  const shop = typeof body.shop === "string" ? body.shop : "";
  const eventId = typeof body.eventId === "string" ? body.eventId.slice(0, 120) : "";
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.slice(0, 120) : "";
  const reject = (error: string) => response(400, { error, diagnosticStage: "endpoint_rejected", event });
  if (!shop || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)) return reject("Invalid shop.");
  if (!eventId || !sessionId) return reject("Missing event identity.");
  if (typeof body.timestamp !== "number" || !Number.isFinite(body.timestamp)) return reject("Invalid timestamp.");
  const allowedEvents = new Set(["page_viewed", "product_viewed", "product_added_to_cart", "product_removed_from_cart", "cart_viewed", "checkout_started", "checkout_completed"]);
  if (!allowedEvents.has(event)) return reject("Unsupported event.");

  if (!env.CARTLIFT_ANALYTICS_KV) return response(202, { ok: true, persisted: false });
  try {
    const key = `analytics:${shop}`;
    const current = await env.CARTLIFT_ANALYTICS_KV.get(key, "json") as AnalyticsRecord | null;
    const events = current?.events ?? {};
    const eventIds = current?.eventIds ?? [];
    const sessions = current?.sessions ?? 0;

    if (eventIds.includes(eventId)) return response(202, { ok: true, persisted: true, duplicate: true });

    events[event] = Math.min((events[event] ?? 0) + 1, 10_000_000);
    const nextEventIds = [...eventIds, eventId].slice(-5000);
    const knownSession = Boolean(current?.eventIds?.length && current.eventIds.includes(`session:${sessionId}`));
    if (!knownSession) nextEventIds.push(`session:${sessionId}`);
    await env.CARTLIFT_ANALYTICS_KV.put(key, JSON.stringify({
      events,
      total: Object.values(events).reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0),
      sessions: sessions + (knownSession ? 0 : 1),
      eventIds: nextEventIds.slice(-10000),
      lastEventAt: Date.now(),
    }), { expirationTtl: 60 * 60 * 24 * 180 });
    return response(202, { ok: true, persisted: true, duplicate: false });
  } catch {
    return response(503, { error: "Analytics storage failed.", diagnosticStage: "kv_persist_failed", event });
  }
};

export const onRequestGet: PagesFunction<AnalyticsEnv> = async ({ request, env }) => {
  try {
    const idToken = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!idToken) throw new Error(INVALID_ID_TOKEN);
    const claims = verifyIdToken(idToken, env);
    const shop = new URL(claims.dest!).hostname;
    if (!env.CARTLIFT_ANALYTICS_KV) return response(200, { configured: false, events: {}, total: 0, sessions: 0, insights: buildInsights({}, 0), lastEventAt: null, delivery: null });
    const data = await env.CARTLIFT_ANALYTICS_KV.get(`analytics:${shop}`, "json") as AnalyticsRecord | null;
    const delivery = await env.CARTLIFT_ANALYTICS_KV.get(`analytics:delivery:${shop}`, "json") as DeliveryDiagnostics | null;
    const events = data?.events ?? {};
    const sessions = data?.sessions ?? 0;
    const total = data?.total ?? Object.values(events).reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
    return response(200, { configured: true, events, total, sessions, insights: buildInsights(events, sessions), lastEventAt: data?.lastEventAt ?? null, delivery });
  } catch (error) {
    if (error instanceof Error && error.message === INVALID_ID_TOKEN) return response(401, { error: "Invalid Shopify ID token." });
    return response(502, { error: "Unable to load analytics." });
  }
};
