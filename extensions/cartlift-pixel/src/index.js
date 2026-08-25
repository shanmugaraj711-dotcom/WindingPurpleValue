import { register } from "@shopify/web-pixels-extension";

const ENDPOINT = "https://windingpurplevalue.pages.dev/api/analytics";
const EVENT_NAMES = [
  "page_viewed",
  "product_viewed",
  "product_added_to_cart",
  "product_removed_from_cart",
  "cart_viewed",
  "checkout_started",
  "checkout_completed",
];

register(({ analytics }) => {
  for (const eventName of EVENT_NAMES) {
    analytics.subscribe(eventName, (event) => {
      const shop = event?.context?.document?.location?.hostname || "";
      if (!shop.endsWith(".myshopify.com")) return;

      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: eventName,
          shop,
          timestamp: Date.parse(event?.timestamp || "") || Date.now(),
          id: event?.id ?? null,
          data: event?.data ?? event?.customData ?? null,
        }),
        keepalive: true,
      }).catch(() => undefined);
    });
  }
});
