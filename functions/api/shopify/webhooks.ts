type Env = {
  SHOPIFY_API_SECRET: string;
};

function response(status: number, body: unknown = null): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function verifyHmac(rawBody: ArrayBuffer, signature: string, secret: string): Promise<boolean> {
  if (!signature || !secret) return false;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      "HMAC",
      key,
      decodeBase64(signature),
      rawBody,
    );
  } catch {
    return false;
  }
}

export const onRequestOptions: PagesFunction<Env> = async () =>
  new Response(null, { status: 204 });

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const rawBody = await request.arrayBuffer();
  const signature = request.headers.get("X-Shopify-Hmac-SHA256") ?? "";

  if (!(await verifyHmac(rawBody, signature, env.SHOPIFY_API_SECRET))) {
    return response(401, { error: "Invalid webhook signature." });
  }

  const topic = (request.headers.get("X-Shopify-Topic") ?? "").toLowerCase();
  const shop = request.headers.get("X-Shopify-Shop-Domain") ?? "";

  // CartLift currently does not persist customer records or Shopify offline
  // sessions in this endpoint. Mandatory compliance events are therefore
  // acknowledged after signature verification without retaining their body.
  // This keeps the endpoint privacy-safe while satisfying Shopify's webhook
  // delivery contract.
  if (!topic || !shop) return response(400, { error: "Missing Shopify webhook headers." });

  switch (topic) {
    case "app/uninstalled":
    case "customers/data_request":
    case "customers/redact":
    case "shop/redact":
      return response(200, { ok: true });
    default:
      return response(200, { ok: true });
  }
};
