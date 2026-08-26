type Env = { SHOPIFY_API_KEY: string; SHOPIFY_API_SECRET: string; SHOPIFY_API_VERSION?: string };
type Claims = { aud?: string; dest?: string; exp?: number; nbf?: number; iss?: string };
const INVALID_ID_TOKEN = "INVALID_ID_TOKEN";

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
function decodeJson<T>(value: string): T { return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T; }
async function verifyIdToken(token: string, env: Env): Promise<Claims> {
  const parts = token.trim().split(".");
  if (parts.length !== 3) throw new Error(INVALID_ID_TOKEN);
  const [headerPart, payloadPart, signaturePart] = parts;
  const header = decodeJson<{ alg?: string }>(headerPart);
  if (header.alg !== "HS256") throw new Error(INVALID_ID_TOKEN);
  const secret = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.SHOPIFY_API_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("HMAC", secret, decodeBase64Url(signaturePart), new TextEncoder().encode(`${headerPart}.${payloadPart}`));
  if (!valid) throw new Error(INVALID_ID_TOKEN);
  const claims = decodeJson<Claims>(payloadPart);
  const now = Math.floor(Date.now() / 1000);
  if (!claims.dest || claims.aud !== env.SHOPIFY_API_KEY || !claims.exp || claims.exp <= now || (claims.nbf && claims.nbf > now)) throw new Error(INVALID_ID_TOKEN);
  const destination = new URL(claims.dest);
  if (destination.protocol !== "https:" || !destination.hostname.endsWith(".myshopify.com")) throw new Error(INVALID_ID_TOKEN);
  if (claims.iss && new URL(claims.iss).hostname !== destination.hostname) throw new Error(INVALID_ID_TOKEN);
  return claims;
}
async function exchange(idToken: string, shop: string, env: Env): Promise<string> {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ client_id: env.SHOPIFY_API_KEY, client_secret: env.SHOPIFY_API_SECRET, grant_type: "urn:ietf:params:oauth:grant-type:token-exchange", subject_token: idToken, subject_token_type: "urn:ietf:params:oauth:token-type:id_token", requested_token_type: "urn:shopify:params:oauth:token-type:online-access-token" }),
  });
  if (response.status === 400) throw new Error(INVALID_ID_TOKEN);
  if (!response.ok) throw new Error(`Shopify token exchange failed (${response.status}).`);
  const payload = await response.json() as { access_token?: string };
  if (!payload.access_token) throw new Error("Shopify token exchange returned no access token.");
  return payload.access_token;
}
function invalidSessionResponse(): Response { return new Response(JSON.stringify({ error: "Invalid Shopify ID token." }), { status: 401, headers: { "Content-Type": "application/json", "X-Shopify-Retry-Invalid-Session-Request": "1" } }); }

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const idToken = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!idToken) throw new Error(INVALID_ID_TOKEN);
    const claims = await verifyIdToken(idToken, env);
    const shop = new URL(claims.dest!).hostname;
    const accessToken = await exchange(idToken, shop, env);
    const apiVersion = env.SHOPIFY_API_VERSION || "2026-07";
    const response = await fetch(`https://${shop}/admin/api/${apiVersion}/graphql.json`, { method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": accessToken }, body: JSON.stringify({ query: "query CartLiftWebPixel { webPixel { id settings } }" }) });
    const payload = await response.json() as { data?: { webPixel?: { id?: string; settings?: string } | null }; errors?: Array<{ message?: string }> };
    if (payload.errors?.length) throw new Error(payload.errors.map((e) => e.message || "Shopify GraphQL error").join("; "));
    return Response.json({ connected: Boolean(payload.data?.webPixel), webPixel: payload.data?.webPixel ?? null });
  } catch (error) {
    if (error instanceof Error && error.message === INVALID_ID_TOKEN) return invalidSessionResponse();
    return Response.json({ error: error instanceof Error ? error.message : "Unable to inspect web pixel." }, { status: 502 });
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const idToken = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!idToken) throw new Error(INVALID_ID_TOKEN);
    const claims = await verifyIdToken(idToken, env);
    const shop = new URL(claims.dest!).hostname;
    const accessToken = await exchange(idToken, shop, env);
    const apiVersion = env.SHOPIFY_API_VERSION || "2026-07";
    const response = await fetch(`https://${shop}/admin/api/${apiVersion}/graphql.json`, { method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": accessToken }, body: JSON.stringify({ query: "mutation CartLiftWebPixelCreate($settings: String!) { webPixelCreate(webPixel: { settings: $settings }) { userErrors { field message } webPixel { id settings } } }", variables: { settings: "{}" } }) });
    const payload = await response.json() as { data?: { webPixelCreate?: { userErrors?: Array<{ field?: string[]; message?: string }>; webPixel?: { id?: string; settings?: string } | null } }; errors?: Array<{ message?: string }> };
    if (payload.errors?.length) throw new Error(payload.errors.map((e) => e.message || "Shopify GraphQL error").join("; "));
    const result = payload.data?.webPixelCreate;
    if (result?.userErrors?.length) return Response.json({ error: result.userErrors.map((e) => e.message || "Web pixel error").join("; ") }, { status: 400 });
    return Response.json({ connected: Boolean(result?.webPixel), webPixel: result?.webPixel ?? null });
  } catch (error) {
    if (error instanceof Error && error.message === INVALID_ID_TOKEN) return invalidSessionResponse();
    return Response.json({ error: error instanceof Error ? error.message : "Unable to activate web pixel." }, { status: 502 });
  }
};
