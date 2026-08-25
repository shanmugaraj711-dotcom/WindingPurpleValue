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

for (const eventName of EVENT_NAMES) {
  analytics.subscribe(eventName, (event) => {
    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: eventName,
        timestamp: Date.now(),
        id: event?.id ?? null,
        data: event?.data ?? null,
      }),
      keepalive: true,
    }).catch(() => undefined);
  });
}
