import { createHmac, timingSafeEqual } from "node:crypto";

type IdTokenClaims = {
  aud?: string;
  dest?: string;
  exp?: number;
  nbf?: number;
  iss?: string;
  sub?: string;
};

type StoredToken = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope: string;
};

const tokenStore = new Map<string, StoredToken>();

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for Shopify integration.`);
  return value;
}

function decodePart(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function validateIdToken(idToken: string): IdTokenClaims {
  const secret = requiredEnv("SHOPIFY_API_SECRET");
  const clientId = requiredEnv("SHOPIFY_API_KEY");
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Invalid Shopify ID token.");

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = JSON.parse(decodePart(encodedHeader)) as { alg?: string };
  if (header.alg !== "HS256") throw new Error("Unsupported Shopify ID token algorithm.");

  const expected = createHmac("sha256", secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  const received = Buffer.from(encodedSignature, "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new Error("Invalid Shopify ID token signature.");
  }

  const claims = JSON.parse(decodePart(encodedPayload)) as IdTokenClaims;
  const now = Math.floor(Date.now() / 1000);
  if (!claims.exp || claims.exp <= now) throw new Error("Shopify ID token has expired.");
  if (claims.nbf && claims.nbf > now) throw new Error("Shopify ID token is not active yet.");
  if (claims.aud !== clientId) throw new Error("Shopify ID token audience mismatch.");
  if (!claims.dest) throw new Error("Shopify ID token is missing its destination.");

  const shop = new URL(claims.dest);
  if (shop.protocol !== "https:" || !shop.hostname.endsWith(".myshopify.com")) {
    throw new Error("Shopify ID token destination is invalid.");
  }

  if (claims.iss) {
    const issuer = new URL(claims.iss);
    if (issuer.hostname !== shop.hostname) throw new Error("Shopify ID token issuer mismatch.");
  }

  return claims;
}

export function getShopFromIdToken(idToken: string): { shop: string; sub?: string } {
  const claims = validateIdToken(idToken);
  return { shop: new URL(claims.dest!).hostname, sub: claims.sub };
}

export async function exchangeIdTokenForOfflineToken(idToken: string): Promise<StoredToken> {
  const { shop } = getShopFromIdToken(idToken);
  const clientId = requiredEnv("SHOPIFY_API_KEY");
  const clientSecret = requiredEnv("SHOPIFY_API_SECRET");

  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      subject_token: idToken,
      subject_token_type: "urn:shopify:params:oauth:token-type:id_token",
      requested_token_type: "urn:shopify:params:oauth:token-type:offline-access-token",
      expiring: "1",
    }),
  });

  if (!response.ok) throw new Error(`Shopify token exchange failed (${response.status}).`);
  const payload = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    scope?: string;
    expires_in?: number;
  };
  if (!payload.access_token || !payload.expires_in) {
    throw new Error("Shopify token exchange returned an incomplete response.");
  }

  const token: StoredToken = {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: Date.now() + payload.expires_in * 1000,
    scope: payload.scope ?? "",
  };
  tokenStore.set(shop, token);
  return token;
}

export function getStoredToken(shop: string): StoredToken | undefined {
  const token = tokenStore.get(shop);
  if (!token || token.expiresAt <= Date.now()) return undefined;
  return token;
}
