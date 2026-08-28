export const onRequest: PagesFunction = async (context) => {
  // Shopify Admin may open CartLift under /apps/<handle>. The actual SPA is
  // root-mounted, so serve the root entry while preserving Shopify's query
  // string for App Bridge authentication.
  const url = new URL(context.request.url);
  url.pathname = "/";
  return context.env.ASSETS.fetch(new Request(url.toString(), context.request));
};
