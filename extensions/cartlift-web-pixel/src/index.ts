import { register } from "@shopify/web-pixels-extension";

register(({ analytics, settings }) => {
  const apiBaseUrl = String(settings.api_base_url || "").replace(/\/$/, "");
  if (!apiBaseUrl) return;

  const shop = typeof window !== "undefined" ? window.location.hostname : "";
  if (!shop.endsWith(".myshopify.com")) return;

  const send = (eventName: string, payload: Record<string, unknown>) => {
    const body = JSON.stringify({
      event: eventName,
      shop,
      timestamp: Date.now(),
      payload,
    });
    fetch(`${apiBaseUrl}/api/analytics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => undefined);
  };

  analytics.subscribe("page_viewed", (event) => send("page_viewed", { id: event.id }));
  analytics.subscribe("product_viewed", (event) => send("product_viewed", { id: event.id }));
  analytics.subscribe("product_added_to_cart", (event) => send("product_added_to_cart", { id: event.id }));
  analytics.subscribe("product_removed_from_cart", (event) => send("product_removed_from_cart", { id: event.id }));
  analytics.subscribe("cart_viewed", (event) => send("cart_viewed", { id: event.id }));
  analytics.subscribe("checkout_started", (event) => send("checkout_started", { id: event.id }));
  analytics.subscribe("checkout_completed", (event) => send("checkout_completed", { id: event.id }));
});
