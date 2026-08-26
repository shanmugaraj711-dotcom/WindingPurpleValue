type Env = {
  SHOPIFY_API_KEY: string;
  SHOPIFY_API_SECRET: string;
  SHOPIFY_API_VERSION?: string;
};

type Claims = {
  aud?: string;
  dest?: string;
  exp?: number;
  nbf?: number;
  iss?: string;
};

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function decodeJson<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T;
}

async function verifyIdToken(token: string, env: Env): Promise<Claims> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid Shopify ID token.");

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJson<{ alg?: string }>(encodedHeader);
  if (header.alg !== "HS256") throw new Error("Unsupported Shopify ID token algorithm.");

  const secret = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.SHOPIFY_API_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  const validSignature = await crypto.subtle.verify(
    "HMAC",
    secret,
    decodeBase64Url(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!validSignature) throw new Error("Invalid Shopify ID token signature.");

  const claims = decodeJson<Claims>(encodedPayload);
  const now = Math.floor(Date.now() / 1000);
  if (!claims.exp || claims.exp <= now) throw new Error("Shopify ID token has expired.");
  if (claims.nbf && claims.nbf > now) throw new Error("Shopify ID token is not active yet.");
  if (claims.aud !== env.SHOPIFY_API_KEY) throw new Error("Shopify ID token audience mismatch.");
  if (!claims.dest) throw new Error("Shopify ID token destination is missing.");

  const destination = new URL(claims.dest);
  if (destination.protocol !== "https:" || !destination.hostname.endsWith(".myshopify.com")) {
    throw new Error("Shopify ID token destination is invalid.");
  }

  if (claims.iss) {
    const issuer = new URL(claims.iss);
    if (issuer.hostname !== destination.hostname) {
      throw new Error("Shopify ID token issuer mismatch.");
    }
  }

  return claims;
}

async function exchangeForExpiringOfflineToken(
  shop: string,
  idToken: string,
  env: Env,
): Promise<{ accessToken: string; scope: string }> {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.SHOPIFY_API_KEY,
      client_secret: env.SHOPIFY_API_SECRET,
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      subject_token: idToken,
      subject_token_type: "urn:shopify:params:oauth:token-type:id_token",
      requested_token_type: "urn:shopify:params:oauth:token-type:offline-access-token",
      expiring: "1",
    }),
  });

  if (response.status === 400) throw new Error("INVALID_ID_TOKEN");
  if (!response.ok) throw new Error(`Shopify token exchange failed (${response.status}).`);

  const payload = (await response.json()) as { access_token?: string; scope?: string };
  if (!payload.access_token) throw new Error("Shopify token exchange returned no access token.");
  return { accessToken: payload.access_token, scope: payload.scope ?? "" };
}

async function ensureCartLiftWebPixel(
  shop: string,
  accessToken: string,
  apiVersion: string,
): Promise<{ connected: boolean; error?: string }> {
  const endpoint = "https://windingpurplevalue.pages.dev/api/analytics";
  const graphqlUrl = `https://${shop}/admin/api/${apiVersion}/graphql.json`;

  const response = await fetch(graphqlUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({
      query: `mutation CartLiftWebPixelCreate($webPixel: WebPixelInput!) {
        webPixelCreate(webPixel: $webPixel) {
          userErrors { field message code }
          webPixel { id settings }
        }
      }`,
      variables: { webPixel: { settings: { endpoint } } },
    }),
  });

  if (!response.ok) {
    return { connected: false, error: `Web pixel activation failed (${response.status}).` };
  }

  const payload = (await response.json()) as {
    data?: {
      webPixelCreate?: {
        userErrors?: Array<{ field?: string[]; message?: string; code?: string }>;
        webPixel?: { id?: string; settings?: string } | null;
      };
    };
    errors?: Array<{ message?: string }>;
  };

  if (payload.errors?.length) {
    return {
      connected: false,
      error: payload.errors.map((item) => item.message ?? "Unknown Shopify error").join("; "),
    };
  }

  const result = payload.data?.webPixelCreate;
  if (result?.webPixel) return { connected: true };

  const userErrors = result?.userErrors ?? [];
  if (userErrors.some((item) => item.code === "TAKEN")) {
    // Shopify allows only one app web pixel per app/store. TAKEN means the
    // merchant already has the CartLift pixel record, so activation is done.
    return { connected: true };
  }

  return {
    connected: false,
    error: userErrors.map((item) => item.message ?? "Web pixel activation error").join("; ") || "Web pixel activation returned no pixel.",
  };
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const authorization = request.headers.get("Authorization") ?? "";
  const idToken = authorization.replace(/^Bearer\s+/i, "").trim();

  if (!idToken) return Response.json({ error: "Missing Shopify ID token." }, { status: 401 });

  try {
    const claims = await verifyIdToken(idToken, env);
    const shop = new URL(claims.dest!).hostname;
    const { accessToken, scope } = await exchangeForExpiringOfflineToken(shop, idToken, env);
    const apiVersion = env.SHOPIFY_API_VERSION || "2026-07";

    const adminResponse = await fetch(`https://${shop}/admin/api/${apiVersion}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({
        query: `query CartLiftShopIdentity { shop { name myshopifyDomain } }`,
      }),
    });

    if (!adminResponse.ok) {
      return Response.json({ error: `Shopify Admin API failed (${adminResponse.status}).` }, { status: 502 });
    }

    const payload = (await adminResponse.json()) as {
      data?: { shop?: { name?: string; myshopifyDomain?: string } };
      errors?: Array<{ message?: string }>;
    };

    if (payload.errors?.length) {
      return Response.json(
        { error: payload.errors.map((item) => item.message ?? "Unknown Shopify error").join("; ") },
        { status: 502 },
      );
    }

    // Shopify requires webPixelCreate after the app version containing the
    // extension has been released. Do this automatically when CartLift opens.
    const pixel = await ensureCartLiftWebPixel(shop, accessToken, apiVersion);

    return Response.json({ shop: payload.data?.shop ?? null, scope, pixel });
  } catch (error) {
    const invalidSession = error instanceof Error && error.message === "INVALID_ID_TOKEN";
    if (invalidSession) {
      return new Response(JSON.stringify({ error: "Invalid Shopify ID token." }), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Retry-Invalid-Session-Request": "1",
        },
      });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Shopify authentication failed." },
      { status: 401 },
    );
  }
};
