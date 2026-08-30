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
  name?: string;
  data?: unknown;
  customData?: unknown;
  timestamp?: string;
};

type DiagnosticStage = "pixel_initialized" | "privacy_blocked" | "request_failed" | "endpoint_rejected" | "endpoint_accepted";

register(({ analytics, init, customerPrivacy, settings }) => {
  const apiBaseUrl = String(settings?.endpoint || "https://windingpurplevalue.pages.dev/api/analytics");
  const hostname = init.context.document.location?.hostname || "";
  const shop = hostname.endsWith(".myshopify.com") ? hostname : "";
  if (!shop) return;

  let analyticsAllowed = init.customerPrivacy?.analyticsProcessingAllowed ?? true;

  const reportDiagnostic = (stage: DiagnosticStage, event?: string, error?: string) => {
    fetch(apiBaseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ diagnostic: { stage, status: stage === "request_failed" || stage === "endpoint_rejected" || stage === "privacy_blocked" ? "error" : "ok", shop, event, error } }),
      keepalive: true,
    }).catch(() => undefined);
  };

  reportDiagnostic("pixel_initialized");

  customerPrivacy.subscribe("visitorConsentCollected", (event) => {
    analyticsAllowed = event.customerPrivacy.analyticsProcessingAllowed;
  });

  const sessionId = (() => {
    try { return crypto.randomUUID(); }
    catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
  })();

  const send = (eventName: string, event: PixelEvent) => {
    if (!analyticsAllowed) {
      reportDiagnostic("privacy_blocked", eventName);
      return;
    }
    const eventId = event.id || (() => {
      try { return crypto.randomUUID(); }
      catch { return `${eventName}-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
    })();

    fetch(apiBaseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: eventName,
        eventId,
        sessionId,
        shop,
        timestamp: Date.parse(event.timestamp || "") || Date.now(),
        payload: {
          id: event.id ?? null,
          data: event.data ?? null,
          customData: event.customData ?? null,
        },
      }),
      keepalive: true,
    }).then(async (response) => {
      if (response.ok) return;
      let error = `HTTP ${response.status}`;
      try {
        const payload = await response.json() as { error?: string };
        error = payload.error || error;
      } catch { /* response body is optional for diagnostics */ }
      reportDiagnostic("endpoint_rejected", eventName, error);
    }).catch((error) => {
      reportDiagnostic("request_failed", eventName, error instanceof Error ? error.message : "Network request failed");
    });
  };

  for (const eventName of EVENT_NAMES) {
    analytics.subscribe(eventName, (event) => send(eventName, event));
  }

  // Shopify custom customer events are also exposed through all_custom_events.
  // Using that stream makes the cart-drawer compatibility event resilient to
  // custom-event name normalization across Shopify pixel runtime versions.
  analytics.subscribe("all_custom_events", (event) => {
    const name = String(event.name || "");
    const customEvent = name === "cartlift:cart_drawer_viewed" || name === "cart_drawer_viewed";
    if (customEvent) send("cart_viewed", event);
  });
});
