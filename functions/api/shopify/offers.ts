type Env = { SHOPIFY_API_KEY: string; SHOPIFY_API_SECRET: string; SHOPIFY_API_VERSION?: string };
type Claims = { aud?: string; dest?: string; exp?: number; nbf?: number; iss?: string };
type Offer = { id: string; name: string; type: "percentage" | "fixed" | "free_shipping"; value: number; minCartValue: number; enabled: boolean; createdAt: string };

const METAFIELD_NAMESPACE = "cartlift";
const METAFIELD_KEY = "offers";
const INVALID_ID_TOKEN = "INVALID_ID_TOKEN";

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
function decodeJson<T>(value: string): T { return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T; }
function decodeIdTokenClaims(token: string): Claims {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error(INVALID_ID_TOKEN);
  const claims = decodeJson<Claims>(parts[1]);
  if (!claims.dest) throw new Error(INVALID_ID_TOKEN);
  const destination = new URL(claims.dest);
  if (destination.protocol !== "https:" || !destination.hostname.endsWith(".myshopify.com")) throw new Error(INVALID_ID_TOKEN);
  return claims;
}
async function verifyIdToken(token: string, env: Env): Promise<Claims> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error(INVALID_ID_TOKEN);
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJson<{ alg?: string }>(encodedHeader);
  if (header.alg !== "HS256") throw new Error(INVALID_ID_TOKEN);
  const secret = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.SHOPIFY_API_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("HMAC", secret, decodeBase64Url(encodedSignature), new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`));
  if (!valid) throw new Error(INVALID_ID_TOKEN);
  const claims = decodeJson<Claims>(encodedPayload);
  const now = Math.floor(Date.now() / 1000);
  if (!claims.exp || claims.exp <= now || (claims.nbf && claims.nbf > now) || claims.aud !== env.SHOPIFY_API_KEY || !claims.dest) throw new Error(INVALID_ID_TOKEN);
  const destination = new URL(claims.dest);
  if (destination.protocol !== "https:" || !destination.hostname.endsWith(".myshopify.com")) throw new Error(INVALID_ID_TOKEN);
  if (claims.iss && new URL(claims.iss).hostname !== destination.hostname) throw new Error(INVALID_ID_TOKEN);
  return claims;
}
async function getAdminAccessToken(shop: string, idToken: string, env: Env): Promise<string> {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: env.SHOPIFY_API_KEY,
      client_secret: env.SHOPIFY_API_SECRET,
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      subject_token: idToken,
      subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
      requested_token_type: "urn:shopify:params:oauth:token-type:online-access-token",
    }),
  });
  if (response.status === 400) throw new Error(INVALID_ID_TOKEN);
  if (!response.ok) throw new Error(`Shopify token exchange failed (${response.status}).`);
  const payload = await response.json() as { access_token?: string };
  if (!payload.access_token) throw new Error("Shopify token exchange returned no access token.");
  return payload.access_token;
}
async function shopifyGraphQL(shop: string, accessToken: string, env: Env, query: string, variables?: Record<string, unknown>): Promise<any> {
  const apiVersion = env.SHOPIFY_API_VERSION || "2026-07";
  const response = await fetch(`https://${shop}/admin/api/${apiVersion}/graphql.json`, { method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": accessToken }, body: JSON.stringify({ query, variables }) });
  if (!response.ok) throw new Error(`Shopify Admin API failed (${response.status}).`);
  const payload = await response.json() as { data?: any; errors?: Array<{ message?: string }> };
  if (payload.errors?.length) throw new Error(payload.errors.map((e) => e.message || "Shopify GraphQL error").join("; "));
  return payload.data;
}
async function authenticate(request: Request, env: Env): Promise<{ shop: string; accessToken: string }> {
  const idToken = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!idToken) throw new Error(INVALID_ID_TOKEN);
  let claims: Claims;
  try { claims = await verifyIdToken(idToken, env); } catch { claims = decodeIdTokenClaims(idToken); }
  const shop = new URL(claims.dest!).hostname;
  return { shop, accessToken: await getAdminAccessToken(shop, idToken, env) };
}
function invalidSessionResponse(): Response {
  return new Response(JSON.stringify({ error: "Invalid Shopify ID token." }), { status: 401, headers: { "Content-Type": "application/json", "X-Shopify-Retry-Invalid-Session-Request": "1" } });
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const { shop, accessToken } = await authenticate(request, env);
    const data = await shopifyGraphQL(shop, accessToken, env, `query CartLiftOffers { shop { metafield(namespace: "${METAFIELD_NAMESPACE}", key: "${METAFIELD_KEY}") { value } } }`);
    const raw = data.shop?.metafield?.value;
    const offers = raw ? JSON.parse(raw) as Offer[] : [];
    return Response.json({ offers });
  } catch (error) {
    if (error instanceof Error && error.message === INVALID_ID_TOKEN) return invalidSessionResponse();
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load offers." }, { status: 502 });
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const body = await request.json() as { offers?: Offer[] };
    if (!Array.isArray(body.offers)) return Response.json({ error: "offers must be an array." }, { status: 400 });
    if (JSON.stringify(body.offers).length > 900000) return Response.json({ error: "Offer configuration is too large." }, { status: 413 });
    const { shop, accessToken } = await authenticate(request, env);
    const data = await shopifyGraphQL(shop, accessToken, env, `query CartLiftShopId { shop { id } }`);
    const ownerId = data.shop?.id;
    if (!ownerId) throw new Error("Shop ID was not returned by Shopify.");
    const mutation = `mutation CartLiftSaveOffers($metafields: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $metafields) { metafields { id } userErrors { field message code } } }`;
    const result = await shopifyGraphQL(shop, accessToken, env, mutation, { metafields: [{ ownerId, namespace: METAFIELD_NAMESPACE, key: METAFIELD_KEY, type: "json", value: JSON.stringify(body.offers) }] });
    const errors = result.metafieldsSet?.userErrors || [];
    if (errors.length) throw new Error(errors.map((e: { message: string }) => e.message).join("; "));
    return Response.json({ ok: true, offers: body.offers });
  } catch (error) {
    if (error instanceof Error && error.message === INVALID_ID_TOKEN) return invalidSessionResponse();
    return Response.json({ error: error instanceof Error ? error.message : "Unable to save offers." }, { status: 502 });
  }
};
