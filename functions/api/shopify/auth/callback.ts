export const onRequestGet: PagesFunction = async () =>
  Response.json({
    message: "CartLift uses Shopify managed installation and App Bridge ID-token exchange; this callback is retained as the required valid redirect URL for app configuration.",
  });
