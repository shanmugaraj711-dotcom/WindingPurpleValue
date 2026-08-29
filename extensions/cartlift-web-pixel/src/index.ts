import { register } from "@shopify/web-pixels-extension";

const EVENT_NAMES = [
  "page_viewed",
  "product_viewed",
  "product_added_to_cart",
  "product_removed_from_cart",
  "cart_viewed",
  "checkout_started",
  "checkout_completed",
] as const;

type PixelEvent = {
  id?: string;
  data?: unknown;
  customData?: unknown;
  timestamp?: string;
};

register(({ analytics, init, customerPrivacy, settings }) => {
  const apiBaseUrl = String(settings?.endpoint || "https://windingpurplevalue.pages.dev/api/analytics");
  const hostname = init.context.document.location?.hostname || "";
  const shop = hostname.endsWith(".myshopify.com") ? hostname : "";
  if (!shop) return;

  let analyticsAllowed = init.customerPrivacy?.analyticsProcessingAllowed ?? true;
  customerPrivacy.subscribe("visitorConsentCollected", (event) => {
    analyticsAllowed = event.customerPrivacy.analyticsProcessingAllowed;
  });

  const send = (eventName: string, event: PixelEvent) => {
    if (!analyticsAllowed) return;
    fetch(apiBaseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: eventName,
        shop,
        timestamp: Date.parse(event.timestamp || "") || Date.now(),
        payload: {
          id: event.id ?? null,
          data: event.data ?? null,
          customData: event.customData ?? null,
        },
      }),
      keepalive: true,
    }).catch(() => undefined);
  };

  for (const eventName of EVENT_NAMES) {
    analytics.subscribe(eventName, (event) => send(eventName, event));
  }

  // Compatibility fallback for themes that do not emit Shopify's standard
  // cart:view event for a cart drawer. The theme embed publishes this custom
  // event only after it confirms the drawer is actually open.
  analytics.subscribe("cartlift:cart_drawer_viewed", (event) => send("cart_viewed", event));
});
