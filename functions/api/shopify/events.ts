type Env = {
  SHOPIFY_API_SECRET: string;
};

function response(status: number, body: unknown = null): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export const onRequestPost: PagesFunction<Env> = async ({ request }) => {
  // Shopify Events currently serves only as a deployment/configuration health
  // signal for CartLift. We acknowledge the delivery without persisting it.
  // No customer data is stored by this endpoint.
  try {
    await request.arrayBuffer();
    return response(200, { ok: true });
  } catch {
    return response(400, { error: "Unable to read event payload." });
  }
};
