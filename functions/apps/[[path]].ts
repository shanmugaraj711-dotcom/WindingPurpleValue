export const onRequestGet: PagesFunction = async (context) => {
  // Shopify Admin can open embedded apps under /apps/<handle> (or another
  // app-prefixed path). CartLift is a root-mounted SPA, so serve the SPA entry
  // while preserving Shopify's query string for App Bridge authentication.
  const url = new URL(context.request.url);
  url.pathname = "/";
  return context.env.ASSETS.fetch(new Request(url.toString(), context.request));
};
