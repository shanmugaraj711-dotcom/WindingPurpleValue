type AnalyticsEnv = {
  CARTLIFT_ANALYTICS_KV?: KVNamespace;
  SHOPIFY_API_KEY: string;
  SHOPIFY_API_SECRET: string;
};

type Claims = { aud?: string; dest?: string; exp?: number; nbf?: number; iss?: string };
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
function response(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type,Authorization" } });
}
export const onRequestOptions: PagesFunction<AnalyticsEnv> = async () => response(204, null);

export const onRequestPost: PagesFunction<AnalyticsEnv> = async ({ request, env }) => {
  try {
    const body = await request.json() as Record<string, unknown>;
    const event = typeof body.event === "string" ? body.event.slice(0, 80) : "unknown";
    const shop = typeof body.shop === "string" ? body.shop : "";
    const eventId = typeof body.eventId === "string" ? body.eventId.slice(0, 120) : "";
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.slice(0, 120) : "";
    if (!shop || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)) return response(400, { error: "Invalid shop." });
    if (!eventId || !sessionId) return response(400, { error: "Missing event identity." });
    if (typeof body.timestamp !== "number" || !Number.isFinite(body.timestamp)) return response(400, { error: "Invalid timestamp." });
    const allowedEvents = new Set(["page_viewed", "product_viewed", "product_added_to_cart", "product_removed_from_cart", "cart_viewed", "checkout_started", "checkout_completed"]);
    if (!allowedEvents.has(event)) return response(400, { error: "Unsupported event." });

    if (env.CARTLIFT_ANALYTICS_KV) {
      const key = `analytics:${shop}`;
      const current = await env.CARTLIFT_ANALYTICS_KV.get(key, "json") as AnalyticsRecord | null;
      const events = current?.events ?? {};
      const eventIds = current?.eventIds ?? [];
      const sessions = current?.sessions ?? 0;

      // Pixel delivery can retry. Treat an event ID as idempotent so one
      // shopper action cannot inflate merchant metrics more than once.
      if (eventIds.includes(eventId)) return response(202, { ok: true, persisted: true, duplicate: true });

      events[event] = Math.min((events[event] ?? 0) + 1, 10_000_000);
      const nextEventIds = [...eventIds, eventId].slice(-5000);
      const knownSession = Boolean(current?.eventIds?.length && current?.eventIds.includes(`session:${sessionId}`));
      // Keep session markers separate from event IDs to avoid changing the
      // event count; they are bounded and only used for funnel denominator.
      if (!knownSession) nextEventIds.push(`session:${sessionId}`);
      await env.CARTLIFT_ANALYTICS_KV.put(key, JSON.stringify({
        events,
        total: Object.values(events).reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0),
        sessions: sessions + (knownSession ? 0 : 1),
        eventIds: nextEventIds.slice(-10000),
        lastEventAt: Date.now(),
      }), { expirationTtl: 60 * 60 * 24 * 180 });
      return response(202, { ok: true, persisted: true, duplicate: false });
    }
    return response(202, { ok: true, persisted: false });
  } catch {
    return response(400, { error: "Invalid analytics event." });
  }
};

export const onRequestGet: PagesFunction<AnalyticsEnv> = async ({ request, env }) => {
  try {
    const idToken = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!idToken) throw new Error(INVALID_ID_TOKEN);
    const claims = verifyIdToken(idToken, env);
    const shop = new URL(claims.dest!).hostname;
    if (!env.CARTLIFT_ANALYTICS_KV) return response(200, { configured: false, events: {}, total: 0, sessions: 0 });
    const data = await env.CARTLIFT_ANALYTICS_KV.get(`analytics:${shop}`, "json") as AnalyticsRecord | null;
    const events = data?.events ?? {};
    const total = data?.total ?? Object.values(events).reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
    return response(200, { configured: true, events, total, sessions: data?.sessions ?? 0, lastEventAt: data?.lastEventAt ?? null });
  } catch (error) {
    if (error instanceof Error && error.message === INVALID_ID_TOKEN) return response(401, { error: "Invalid Shopify ID token." });
    return response(502, { error: "Unable to load analytics." });
  }
};
