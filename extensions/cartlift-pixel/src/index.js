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

function shopFromContext(init) {
  const host = init?.context?.document?.location?.hostname;
  return typeof host === "string" && host.endsWith(".myshopify.com") ? host : "";
}

export default function register() {
  const init = arguments[0] || {};
  const shop = shopFromContext(init);

  for (const eventName of EVENT_NAMES) {
    analytics.subscribe(eventName, (event) => {
      if (!shop) return;
      const payload = {
        event: eventName,
        shop,
        timestamp: Date.now(),
        id: event?.id ?? null,
        data: event?.data ?? null,
      };

      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => undefined);
    });
  }
}
